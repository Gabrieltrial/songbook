# Songbook

Cançoner web per gestionar llistes de cançons amb la lletra i els acords a sobre.

- **Cerca automàtica**: escrius títol i artista, i el servidor busca a la web (DuckDuckGo i Ultimate Guitar), obre la millor pàgina d'acords (Ultimate Guitar, Cifra Club, La Cuerda, E-Chords, AcordesWeb…) i n'extreu la lletra i els acords. Si la primera versió no t'agrada, en tries una altra de la llista.
- **Transport de to**: puja o baixa semitons, amb bemolls o sostinguts segons la tonalitat. Pots desar la cançó en el to nou.
- **Notació**: mostra els acords tal com estan escrits, en C D E o en Do Re Mi.
- **Compartit i editable**: tothom que obre la pàgina veu les mateixes llistes i cançons, i els canvis arriben en directe a totes les pantalles.
- També accepta text enganxat a mà: acords sobre la lletra, ChordPro (`[G]paraula`) o còpies d'Ultimate Guitar.

No té cap dependència. Només cal [Node.js](https://nodejs.org) 18 o més nou.

## Fer-lo servir al teu ordinador

```bash
node server.js
```

Obre <http://localhost:3000>.

En arrencar, el servidor també mostra una adreça com `http://192.168.1.20:3000`. Obre-la a l'iPad o al mòbil, connectats a la mateixa wifi, i tots els aparells comparteixen el mateix cançoner.

Les dades es desen a `data/songbook.json`. Per fer-ne una còpia de seguretat, copia aquest fitxer.

## Opcions

Es configuren amb variables d'entorn:

| Variable | Per a què serveix | Valor per defecte |
|---|---|---|
| `PORT` | Port del servidor | `3000` |
| `EDIT_KEY` | Contrasenya per editar i buscar. Sense contrasenya, qualsevol que obri la pàgina pot fer canvis. | sense contrasenya |
| `DATA_DIR` | Carpeta on es desen les dades | `./data` |
| `USER_AGENT` | Identificació que s'envia a les webs d'acords | `Songbook/1.0` |

Exemple amb contrasenya:

```bash
EDIT_KEY=la-meva-clau node server.js
```

Si la pàgina és pública a internet, posa-hi sempre `EDIT_KEY`. Qui no tingui la contrasenya podrà veure les llistes, però no canviar-les.

## Fer-lo accessible des d'internet

La cerca automàtica i les llistes compartides necessiten el servidor en marxa. Amb **GitHub Pages sol no n'hi ha prou**: allà només funcionaria la carpeta `public/`, amb les dades guardades al navegador de cadascú i sense cerca automàtica.

Algunes opcions:

1. **Des del teu Mac**: deixa `node server.js` en marxa i obre'l a internet amb [Tailscale](https://tailscale.com) (només per als teus aparells) o amb [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (adreça pública).
2. **En un servei d'allotjament** que accepti Node o Docker i tingui **disc persistent**, perquè no es perdi `data/songbook.json`. Per exemple Fly.io amb un volum muntat a `/data`, o Render amb un disc persistent. En molts plans gratuïts el disc s'esborra en cada reinici.
3. **En un Raspberry Pi o un servidor propi**: `node server.js`, o amb Docker:

```bash
docker build -t songbook .
```

```bash
docker run -p 3000:3000 -v songbook-data:/data -e EDIT_KEY=la-meva-clau songbook
```

## Estructura

```
server.js          servidor: dades compartides, cerca i lectura de pàgines d'acords
public/index.html  la pàgina web
public/chords.js   detecció d'acords, transport de to i importació (la fan servir la pàgina i el servidor)
```

## Notes

- La cerca depèn de com estiguin fetes les webs d'acords. Si una web canvia el seu format o bloqueja les peticions, aquella font deixarà de funcionar fins que s'adapti l'extractor (`parseSongHtml` a `server.js`). Les altres fonts continuen funcionant, i sempre pots enganxar el text a mà.
- Pensat per a ús personal. Les lletres i els acords són dels seus autors i de les webs d'on surten.
