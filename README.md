# Brazília 2026

Utazós oldal Rióhoz és Salvadorhoz (nov. 12–23.), az argentina-2026 mintájára.
Élesben: https://tottiandor.github.io/brazil-2026/

## Beállítás egyszer
1. Settings → Pages: Source = Deploy from a branch, `main`, `/ (root)`.
2. Settings → Actions → General → Workflow permissions: **Read and write**.
3. Actions fül → "Sync Google Maps lists" → Run workflow (utána napi kétszer magától fut).
4. Mindkét Google Térkép-lista legyen linkkel megosztva, különben a szinkron üresen jön vissza.

## Mit hol kell szerkeszteni
- `data.js`: napok, programok, járatok, szállások (Salvador és a második riói szállás még üres).
- `places.js`: kézzel írt hely-leírások, nyitvatartások, esős listák.
- `config.js`: webkamera videó-azonosítók.
- Szerkesztés után a `sw.js` elején a `VERSION`-t érdemes átírni, így a telefonokon is biztosan frissül.

## Adatforrások
- Időjárás: MET Norway Locationforecast (CC BY 4.0), közvetlenül a böngészőből, legalább 1 órás gyorsítótárral.
- Helyek: a két közös Google Térkép-lista, `tools/sync_maps_lists.py` → `maps-food.json`, `maps-sights.json`.
- Fotók: Wikimedia Commons (a szerzők az oldal alján).
