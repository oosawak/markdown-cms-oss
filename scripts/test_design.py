import unittest
import io
from unittest.mock import patch
from pathlib import Path
from tempfile import TemporaryDirectory
import design


class DesignTests(unittest.TestCase):
    def test_frontmatter_blocks_and_reference(self):
        css = design.compile_design('---\ncolors:\n  primary: "{colors.brand}"\n  brand: "#123456"\n---\n# Design\n```yaml\nrounded:\n  md: 4px\n```\n')
        self.assertIn('--accent:#123456!important', css)
        self.assertIn('border-radius:4px', css)

    def test_rejects_missing_tokens_cycles_and_injection(self):
        for text in ['# prose only',
                     '```yaml\ncolors: {primary: "red; background:url(https://example.org)"}\n```',
                     '```yaml\ncolors: {primary: "{colors.primary}"}\n```',
                     '```yaml\ncolors: {primary: "{colors.missing}"}\n```',
                     '---\ncolors: {}\n---\n```yaml\ncolors: {}\n```']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                design.compile_design(text)

    def test_example(self):
        self.assertIn('font-size:16px', design.compile_design(
            (design.ROOT / 'content/design/example.md').read_text()))

    def test_file_import_and_failed_import_preserves_saved_file(self):
        with TemporaryDirectory() as directory:
            source = Path(directory) / 'source.md'
            target = Path(directory) / 'saved.md'
            source.write_text('---\ncolors: {primary: "#123456"}\n---\n')
            with patch('sys.argv', ['design.py', '--file', str(source), '--output', str(target)]):
                design.main()
            original = target.read_text()
            source.write_text('# no tokens')
            with patch('sys.argv', ['design.py', '--file', str(source), '--output', str(target)]):
                with self.assertRaises(SystemExit):
                    design.main()
            self.assertEqual(target.read_text(), original)

    def test_url_and_pasted_text(self):
        raw = b'---\ncolors: {primary: "#345678"}\n---\n'
        with TemporaryDirectory() as directory:
            target = Path(directory) / 'design.md'
            for arguments in [['--stdin'], ['--url', 'https://example.org/DESIGN.md']]:
                with self.subTest(arguments=arguments), patch('sys.argv', ['design.py', *arguments, '--output', str(target)]):
                    with patch('sys.stdin') as stdin, patch('design.build_opener') as opener:
                        stdin.buffer = io.BytesIO(raw)
                        opener.return_value.open.return_value.__enter__.return_value.read.return_value = raw
                        design.main()
                        self.assertEqual(target.read_bytes(), raw)
                        if '--url' in arguments:
                            opener.return_value.open.assert_called_once()

    def test_https_only(self):
        for url in ['http://example.org/DESIGN.md', 'file:///etc/passwd', 'https://user:pass@example.org/a']:
            with self.assertRaises(ValueError):
                design.https_url(url)


class DesignSettingsTests(unittest.TestCase):
    def test_source_defaults_to_fixed_natural(self):
        import build
        import yaml
        with patch.dict('os.environ', {'THEME_SWITCHER': ''}), patch.object(build, 'SITE_ID', 'sample'):
            settings = yaml.safe_load((build.CONTENT / 'sites/sample.yml').read_text())
            self.assertEqual(build.design_settings(settings), ('natural', False))
            self.assertEqual(build.design_settings({}), ('natural', False))

    def test_demo_override_and_invalid_settings(self):
        import build
        with patch.object(build, 'SITE_ID', 'sample'):
            with patch.dict('os.environ', {'THEME_SWITCHER': 'true'}):
                self.assertEqual(build.design_settings({'theme_switcher': False, 'template': 'notion'}), ('notion', True))
            with patch.dict('os.environ', {'THEME_SWITCHER': ''}):
                for settings in [{'template': 'missing'}, {'theme_switcher': 'false'}]:
                    with self.assertRaises(ValueError):
                        build.design_settings(settings)
            with patch.dict('os.environ', {'THEME_SWITCHER': 'invalid'}):
                with self.assertRaises(ValueError):
                    build.design_settings({})
