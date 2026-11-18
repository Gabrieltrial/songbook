# Songbook

Cançoner web per gestionar llistes de cançons amb la lletra i els acords a sobre.

- **Cerca automàtica**: escrius títol i artista, i el servidor busca a la web (DuckDuckGo i Ultimate Guitar), obre la millor pàgina d'acords (Ultimate Guitar, Cifra Club, La Cuerda, E-Chords, AcordesWeb…) i n'extreu la lletra i els acords. Si la primera versió no t'agrada, en tries una altra de la llista.
- **Transport de to**: puja o baixa semitons, amb bemolls o sostinguts segons la tonalitat. Pots desar la cançó en el to nou.
- **Notació**: mostra els acords tal com estan escrits, en C D E o en Do Re Mi.
- **Desplaçament automàtic**: el botó ▶ Scroll (o la barra espaiadora) fa baixar el text al ritme de la cançó. Comença quan arribes a la part baixa de la pantalla i acaba just al final de la cançó. La velocitat surt de la durada de la gravació original, que es busca automàticament. Amb − i + la pots ajustar de 5 en 5 segons. Si fas scroll a mà, continua des d'on l'hagis deixat. Mentre es desplaça, la pantalla no s'apaga.
- **Enllaç a la gravació original**: cada cançó té un botó que porta a la versió original a YouTube (o Apple Music). Es pot canviar a l'editor.
- **Aspecte de Real Book**: acords amb la tipografia MuseJazz Text, amb les alteracions, la "m" de menor i les extensions més petites (C♯m⁷♭⁵), i seccions en requadre. Dues mides de lletra.
- **Pantalla completa**: la icona ⛶ amaga menús i controls i deixa només la cançó, amb els botons de desplaçament i de sortir. Als iPhone, on el navegador no permet la pantalla completa real, fa el mateix dins la pàgina. Si l'afegeixes a la pantalla d'inici des de Safari, també desapareix la barra del navegador.
- **Exportar / importar**: tries les llistes i les exportes en **PDF** (una cançó per pàgina, amb portada i índex de cada llista) o en una **còpia de seguretat** (`.json`) que després pots tornar a carregar a la mateixa pàgina. El PDF es genera amb la finestra d'impressió: tria "Desar com a PDF" i la carpeta on el vols. A l'iPhone i l'iPad, a la finestra d'impressió toca Compartir → Desa a Fitxers.
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
public/fonts/      tipografia MuseJazz Text (© Torsten Hämmerle, Abraham Lee; llicència SIL OFL, vegeu OFL.txt)
```

## Notes

- La cerca depèn de com estiguin fetes les webs d'acords. Si una web canvia el seu format o bloqueja les peticions, aquella font deixarà de funcionar fins que s'adapti l'extractor (`parseSongHtml` a `server.js`). Les altres fonts continuen funcionant, i sempre pots enganxar el text a mà.
- Pensat per a ús personal. Les lletres i els acords són dels seus autors i de les webs d'on surten.
