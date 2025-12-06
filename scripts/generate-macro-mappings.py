#!/usr/bin/env python3
"""
Generate macro-mappings.json from CSV data files.
Processes TextCommand and CraftAction CSV files for zh, en, ja languages.
"""

import csv
import json
from pathlib import Path
from datetime import datetime
import re

# Project root
PROJECT_ROOT = Path(__file__).parent.parent

def parse_csv_rows(filepath):
    """Parse CSV file and return rows as list of dicts."""
    rows = []
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        content = f.read()

    # Split by newlines, handling quoted fields that may contain newlines
    lines = []
    current_line = []
    in_quotes = False

    for char in content:
        if char == '"':
            in_quotes = not in_quotes
            current_line.append(char)
        elif char == '\n' and not in_quotes:
            lines.append(''.join(current_line))
            current_line = []
        else:
            current_line.append(char)

    if current_line:
        lines.append(''.join(current_line))

    # Parse as CSV
    reader = csv.reader(lines)
    header = None
    skip_next = 0

    for i, row in enumerate(reader):
        if i == 0:
            # First row is the header: key,0,1,2,3,4,5,6,7,8,9,10,11
            header = row
            continue

        # Skip rows that start with #, offset, or type definitions
        if len(row) > 0 and (row[0].startswith('#') or row[0] == 'offset' or row[0] in ['int32', 'str', 'byte', 'sbyte', 'uint32']):
            continue

        if len(row) < 2:
            continue

        # Create dict from row using header as keys
        row_dict = {}
        for j, val in enumerate(row):
            if j < len(header):
                row_dict[header[j]] = val
            else:
                row_dict[f'col_{j}'] = val

        rows.append(row_dict)

    return rows

def extract_text_commands(zh_file, en_file, ja_file):
    """Extract and merge text commands from all language files."""
    zh_rows = parse_csv_rows(zh_file)
    en_rows = parse_csv_rows(en_file)
    ja_rows = parse_csv_rows(ja_file)

    # Create lookup by key
    en_by_key = {r.get('key', ''): r for r in en_rows if r.get('key')}
    ja_by_key = {r.get('key', ''): r for r in ja_rows if r.get('key')}

    commands = []
    seen_commands = set()

    for zh_row in zh_rows:
        key = zh_row.get('key', '')
        if not key:
            continue

        # Get corresponding rows from other languages
        en_row = en_by_key.get(key, {})
        ja_row = ja_by_key.get(key, {})

        # Extract command info from columns
        # Header: key,0,1,2,3,4,5,6,7,8,9,10,11
        # Comment: #,,,,,,Command,ShortCommand,Description,Alias,ShortAlias,Param
        # Mapping (header → meaning):
        #   '5' → Command (base English command like /record)
        #   '6' → ShortCommand
        #   '7' → Description
        #   '8' → Alias (localized command like /任務回顧)
        #   '9' → ShortAlias (localized short alias like /replay)
        #   '10' → Param

        base_cmd = zh_row.get('5', '').strip().strip('"')
        if not base_cmd:
            base_cmd = en_row.get('5', '').strip().strip('"')

        zh_alias = zh_row.get('8', '').strip().strip('"')
        zh_short = zh_row.get('9', '').strip().strip('"')
        en_alias = en_row.get('8', '').strip().strip('"')
        en_short = en_row.get('9', '').strip().strip('"')
        ja_alias = ja_row.get('8', '').strip().strip('"')
        ja_short = ja_row.get('9', '').strip().strip('"')

        # Skip empty commands
        if not base_cmd and not zh_alias and not en_alias and not ja_alias:
            continue

        # Skip if alias looks like a number (parsing error)
        if zh_alias.isdigit() or en_alias.isdigit() or ja_alias.isdigit():
            continue

        # Use en_alias if it's empty but base_cmd exists
        if not en_alias and base_cmd:
            en_alias = base_cmd

        # Create unique key based on base command or alias
        cmd_key = base_cmd.lower() if base_cmd else zh_alias.lower()
        if not cmd_key or cmd_key in seen_commands:
            continue
        seen_commands.add(cmd_key)

        cmd_entry = {
            'baseCommand': base_cmd,
            'zh': {'alias': zh_alias, 'shortAlias': zh_short},
            'en': {'alias': en_alias, 'shortAlias': en_short},
            'ja': {'alias': ja_alias, 'shortAlias': ja_short}
        }

        commands.append(cmd_entry)

    return commands

def extract_craft_actions(zh_file, en_file, ja_file):
    """Extract and merge craft actions from all language files."""
    zh_rows = parse_csv_rows(zh_file)
    en_rows = parse_csv_rows(en_file)
    ja_rows = parse_csv_rows(ja_file)

    # Create lookup by key
    en_by_key = {r.get('key', ''): r for r in en_rows if r.get('key')}
    ja_by_key = {r.get('key', ''): r for r in ja_rows if r.get('key')}

    # Use dict to deduplicate by name combination
    actions_map = {}

    for zh_row in zh_rows:
        key = zh_row.get('key', '')
        if not key:
            continue

        # Get corresponding rows from other languages
        en_row = en_by_key.get(key, {})
        ja_row = ja_by_key.get(key, {})

        # Header: key,0,1,2,3,...
        # Comment: #,Name,Description,...
        # So column '0' is Name
        zh_name = zh_row.get('0', '').strip().strip('"')
        en_name = en_row.get('0', '').strip().strip('"')
        ja_name = ja_row.get('0', '').strip().strip('"')

        # Skip empty names
        if not zh_name and not en_name and not ja_name:
            continue

        # Use name combination as unique key to deduplicate (same action appears for different jobs)
        unique_key = f"{zh_name}|{en_name}|{ja_name}"

        if unique_key not in actions_map:
            actions_map[unique_key] = {
                'zh': zh_name,
                'en': en_name,
                'ja': ja_name
            }

    return list(actions_map.values())

def main():
    """Main function to generate macro-mappings.json."""
    print("Processing CSV files...")

    # File paths
    text_cmd_zh = PROJECT_ROOT / 'TextCommand.csv'
    text_cmd_en = PROJECT_ROOT / 'TextCommand-en.csv'
    text_cmd_ja = PROJECT_ROOT / 'TextCommand-jp.csv'

    craft_act_zh = PROJECT_ROOT / 'CraftAction.csv'
    craft_act_en = PROJECT_ROOT / 'CraftAction-en.csv'
    craft_act_ja = PROJECT_ROOT / 'CraftAction-jp.csv'

    # Extract data
    print("Extracting text commands...")
    text_commands = extract_text_commands(text_cmd_zh, text_cmd_en, text_cmd_ja)
    print(f"  Found {len(text_commands)} unique text commands")

    print("Extracting craft actions...")
    craft_actions = extract_craft_actions(craft_act_zh, craft_act_en, craft_act_ja)
    print(f"  Found {len(craft_actions)} unique craft actions")

    # Create output structure
    output = {
        'version': '1.0.0',
        'generated': datetime.now().isoformat(),
        'textCommands': text_commands,
        'craftActions': craft_actions
    }

    # Write to data directory
    output_path = PROJECT_ROOT / 'data' / 'macro-mappings.json'
    output_path.parent.mkdir(exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nGenerated: {output_path}")
    print(f"Total text commands: {len(text_commands)}")
    print(f"Total craft actions: {len(craft_actions)}")

if __name__ == '__main__':
    main()
