"""Fetch the two shared Google Maps lists (Étel, Látnivaló) and write maps-food.json / maps-sights.json.

Runs twice a day in GitHub Actions (.github/workflows/sync-maps-lists.yml). Standard library only.
Same approach as the Argentina repo. Accommodation pins are dropped so the public site never shows
where we sleep. The lists must be shared by link, otherwise Google returns nothing.
"""
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone

LISTS = {
    'maps-food.json': 'Kt88p0iXJ5Ld9NV8FMJHCkt3GBjgoA',
    'maps-sights.json': '7s9O81HG05cLmfwJA2ma2C1ordADfg',
}
URL = ('https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=hu&gl=hu'
       '&pb=!1m4!1s{list_id}!2e1!3m1!1e1!2e2!3e2!4i500!16b1')

# Pins that are (or look like) where we stay: a "szállás"/Airbnb note or name, or a bare street address with no place name.
LODGING = re.compile(r'sz[aá]ll[aá]s|airbn|hotel|hostel|pousada|apartman|apartamento|flat\b', re.I)
BARE_ADDRESS = re.compile(r'^(r\.|rua|av\.|avenida|travessa|tv\.|praça|alameda|estrada|largo)\s.*\d{1,5}\b', re.I)


def fetch(list_id):
    req = urllib.request.Request(URL.format(list_id=list_id), headers={
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        'Cookie': 'SOCS=CAI',  # skip the cookie-consent interstitial (rejects non-essential cookies)
    })
    raw = urllib.request.urlopen(req, timeout=30).read().decode('utf-8')
    return json.loads(raw.split('\n', 1)[1])


def parse(data):
    places = []
    for it in (data[0][8] or []):
        info = it[1] or []
        name = (it[2] if len(it) > 2 else '') or ''
        note = (it[3] if len(it) > 3 else '') or ''
        addr = info[4] if len(info) > 4 and info[4] else ''
        coords = info[5] if len(info) > 5 and info[5] else None
        if not name or not coords:
            continue
        if LODGING.search(note) or LODGING.search(name) or BARE_ADDRESS.match(name):
            continue
        places.append({'name': name, 'addr': addr, 'll': [round(coords[2], 5), round(coords[3], 5)], 'note': note.strip()})
    return places


def sync(out, list_id):
    try:
        places = parse(fetch(list_id))
    except Exception as e:  # network hiccup or Google changed the format: keep the previous file
        print(f'{out}: fetch failed ({e}), keeping the old file')
        return False
    try:
        old = json.load(open(out, encoding='utf-8'))
    except (OSError, ValueError):
        old = {'places': []}
    if not places and old.get('places'):
        print(f'{out}: 0 places parsed, keeping the old file')
        return False
    if old.get('places') == places and old.get('updatedAt'):
        print(f'{out}: no change')
        return True
    json.dump({'updatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'list': list_id, 'places': places},
              open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{out}: updated, {len(places)} places')
    return True


def main():
    ok = [sync(out, list_id) for out, list_id in LISTS.items()]
    if not any(ok):
        sys.exit('no list could be synced')


if __name__ == '__main__':
    main()
