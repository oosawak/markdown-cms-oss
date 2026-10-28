#!/usr/bin/env python3
"""Import DESIGN.md and compile its supported tokens into scoped CSS."""
import argparse
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen, HTTPRedirectHandler, build_opener
import yaml

ROOT = Path(__file__).resolve().parents[1]
LIMIT = 256 * 1024


class UniqueLoader(yaml.SafeLoader):
    pass


def unique_mapping(loader, node):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node)
        if not isinstance(key, str) or key in result:
            raise ValueError('DESIGN.md YAML keys must be unique strings')
        result[key] = loader.construct_object(value_node)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


def parse_design(text):
    if len(text.encode('utf-8')) > LIMIT:
        raise ValueError('DESIGN.md must be at most 256 KiB')
    text = text.lstrip('\ufeff').replace('\r\n', '\n')
    blocks = []
    front = re.match(r'^---\n(.*?)\n---(?:\n|$)', text, re.S)
    if front:
        blocks.append(front.group(1))
        text = text[front.end():]
    blocks.extend(re.findall(r'^```ya?ml\s*\n(.*?)^```\s*$', text, re.M | re.S))
    tokens = {}
    for block in blocks:
        data = yaml.load(block, Loader=UniqueLoader)
        if not isinstance(data, dict):
            raise ValueError('DESIGN.md YAML must contain a mapping')
        overlap = tokens.keys() & data.keys()
        if overlap:
            raise ValueError('Duplicate DESIGN.md group: ' + ', '.join(sorted(overlap)))
        tokens.update(data)
    return tokens


def compile_design(text):
    tokens = parse_design(text)

    def resolve(value, seen=()):
        if isinstance(value, str) and re.fullmatch(r'\{[\w.-]+\}', value):
            key = value[1:-1]
            if key in seen or len(seen) > 20:
                raise ValueError('Cyclic DESIGN.md reference: ' + key)
            node = tokens
            for part in key.split('.'):
                if not isinstance(node, dict) or part not in node:
                    raise ValueError('Unknown DESIGN.md reference: ' + key)
                node = node[part]
            return resolve(node, (*seen, key))
        return value

    def value(group, name, kind):
        data = tokens.get(group, {})
        if not isinstance(data, dict):
            raise ValueError(group + ' must be a mapping')
        if name not in data:
            return None
        raw = resolve(data[name])
        patterns = {
            'color': r'#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})',
            'length': r'(?:0|\d+(?:\.\d+)?(?:px|rem|em))',
            'font': r'[\w ,\'"-]+',
        }
        if not isinstance(raw, str) or not re.fullmatch(patterns[kind], raw):
            raise ValueError(f'Unsupported {group}.{name}: {raw!r}')
        return raw

    rules = []
    palette = {'primary': '--accent', 'primary-container': '--accentsoft',
               'neutral': '--bg', 'surface': '--paper', 'on-surface': '--ink',
               'secondary': '--muted', 'outline': '--line'}
    for name, variable in palette.items():
        color = value('colors', name, 'color')
        if color:
            # Runtime sets --accent inline for the legacy site accent.
            rules.append(f':root{{{variable}:{color}!important}}')
    surface = value('colors', 'surface', 'color')
    if surface:
        rules.append(f'.tile,.paper,.siteitem,.photo-features,.crosslink,.service,.topbar,.footer{{background:{surface}}}')
    radius = value('rounded', 'md', 'length')
    if radius:
        rules.append(f'.tile,.paper,.photo-features,.siteitem,.crosslink{{border-radius:{radius}}}')
    gap = value('spacing', 'gutter', 'length')
    if gap:
        rules.append(f'.grid,.article,.introgrid,.siteintro{{gap:{gap}}}')
    for name, selector in [('body-md', 'body,.prose'), ('h1', '.hero h1,.articlehead h1'),
                           ('headline-md', '.sectiontitle h2,.cross h2')]:
        typography = tokens.get('typography', {})
        if not isinstance(typography, dict):
            raise ValueError('typography must be a mapping')
        style = resolve(typography.get(name, {}))
        if not isinstance(style, dict):
            raise ValueError('Typography token must be a mapping: ' + name)
        declarations = []
        for prop, css, kind in [('fontFamily', 'font-family', 'font'), ('fontSize', 'font-size', 'length')]:
            if prop in style:
                # Reuse the same validation for individual typography properties.
                token_key = '__typography_' + name
                tokens[token_key] = style
                declarations.append(f'{css}:{value(token_key, prop, kind)}')
        if declarations:
            rules.append(selector + '{' + ';'.join(declarations) + '}')
    if not rules:
        raise ValueError('No supported tokens found. Add YAML colors, typography, rounded.md or spacing.gutter; see README.')
    return '\n/* Imported DESIGN.md tokens */\n' + '\n'.join(rules) + '\n'


def https_url(url):
    p = urlsplit(url)
    if p.scheme != 'https' or not p.hostname or p.username or p.password:
        raise ValueError('Use an HTTPS URL without credentials (GitHub: use the Raw URL)')
    return url


class HTTPSRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        https_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def main():
    parser = argparse.ArgumentParser(description='Import DESIGN.md from a URL, pasted text, or a file.')
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--url', help='HTTPS Raw Markdown URL')
    source.add_argument('--file', type=Path, help='Existing UTF-8 DESIGN.md file')
    source.add_argument('--stdin', action='store_true', help='Paste text, then press Ctrl-D')
    parser.add_argument('--output', type=Path, default=ROOT / 'content/design/custom.md')
    args = parser.parse_args()
    try:
        if args.url:
            request = Request(https_url(args.url), headers={'User-Agent': 'Markdown-CMS-Design/1.0'})
            with build_opener(HTTPSRedirects()).open(request, timeout=15) as response:
                raw = response.read(LIMIT + 1)
        elif args.file:
            with args.file.open('rb') as stream:
                raw = stream.read(LIMIT + 1)
        else:
            print('Paste DESIGN.md, then press Ctrl-D:', file=sys.stderr)
            raw = sys.stdin.buffer.read(LIMIT + 1)
        if len(raw) > LIMIT:
            raise ValueError('DESIGN.md must be at most 256 KiB')
        text = raw.decode('utf-8')
        compile_design(text)  # Validate before replacing any saved design.
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding='utf-8')
        print('Saved:', args.output)
        print('Set design: design/custom.md in content/sites/<id>.yml (adjust path for --output).')
    except (ValueError, OSError, UnicodeError, yaml.YAMLError) as exc:
        parser.exit(1, f'DESIGN.md import failed: {exc}\n')


if __name__ == '__main__':
    main()
