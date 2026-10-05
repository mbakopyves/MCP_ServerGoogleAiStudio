# Gemini Studio MCP

Un serveur **MCP** qui donne à ton assistant IA (Claude Code, Cursor, VS Code…) la capacité de
**créer des images et des vidéos** avec les modèles de **Google AI Studio** — et surtout
**d'itérer** dessus : regarder le résultat, demander une correction, recommencer.

> MCP (Model Context Protocol) est le standard qui permet à un assistant IA d'appeler des
> « outils » externes. Ce serveur expose 6 outils ; ton assistant décide seul quand les utiliser.

Exemples de demandes une fois branché :

- « Génère une affiche 4:5 pour un concert de makossa à Douala, style rétro années 80. »
- « Retouche `/home/moi/photo.png` : remplace le fond par une plage au coucher du soleil. »
- « Fais une vidéo verticale de 8 s d'un taxi jaune qui traverse Yaoundé sous la pluie,
  vérifie le rendu et corrige ce qui ne colle pas. »

## Prérequis

- **Node.js 22 ou 24** (20 minimum) — vérifie avec `node -v`.
- **Une clé API Google AI Studio** — à créer gratuitement sur <https://aistudio.google.com/apikey>.
  ⚠️ **La génération d'images et de vidéos n'est pas incluse dans le niveau gratuit** (Google y
  fixe un quota à 0) : il faut activer la facturation sur le projet Google lié à la clé.
  Avec une clé gratuite, seuls `gemini_analyser_media` et `gemini_lister_modeles` fonctionnent.
  ℹ️ Les abonnements grand public (Google AI Plus, offres étudiantes) donnent accès à Flow et à
  l'app Gemini, **pas à l'API**. Seuls Google AI Pro et Ultra incluent des crédits Google Cloud
  (10 $ et 100 $ par mois) utilisables avec ce serveur, à activer sur le Google Developer Program.
- **Un client MCP** : Claude Code, Cursor, VS Code (Copilot), Claude Desktop…

## Installation

```bash
# 1. Forke le dépôt sur GitHub, puis clone TON fork
git clone https://github.com/<ton-pseudo>/MCP_ServerGoogleAiStudio.git
cd MCP_ServerGoogleAiStudio

# 2. Installe les dépendances
npm install

# 3. Crée ton fichier .env à partir du modèle
cp .env.example .env          # Windows (cmd) : copy .env.example .env
```

Ouvre `.env` et colle ta clé après `GEMINI_API_KEY=`. **Ce fichier ne doit jamais être commité**
(il est déjà dans `.gitignore`).

```bash
# 4. Démarre le serveur
npm run dev
```

Tu dois voir `Serveur MCP Gemini prêt sur http://127.0.0.1:3000/mcp`.
`npm run dev` redémarre tout seul quand tu modifies le code ou le `.env` ; `npm start` le lance sans surveillance.

Vérification rapide : ouvre <http://127.0.0.1:3000/api> dans ton navigateur → `{"statut":"ok", …}`.

## Brancher ton client

Le serveur doit tourner (`npm run dev`) pendant que tu utilises ton assistant.

### Claude Code

```bash
claude mcp add --transport http --scope user gemini-studio http://127.0.0.1:3000/mcp
```

### Cursor

Fichier `~/.cursor/mcp.json` :

```json
{ "mcpServers": { "gemini-studio": { "url": "http://127.0.0.1:3000/mcp" } } }
```

### VS Code (Copilot, mode agent)

Fichier `.vscode/mcp.json` de ton projet :

```json
{ "servers": { "gemini-studio": { "type": "http", "url": "http://127.0.0.1:3000/mcp" } } }
```

### Claude Desktop

Il ne parle qu'aux serveurs locaux en stdio ; on passe par le pont
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote) dans `claude_desktop_config.json` :

```json
{ "mcpServers": { "gemini-studio": { "command": "npx", "args": ["-y", "mcp-remote", "http://127.0.0.1:3000/mcp"] } } }
```

### Tester sans assistant

`npm run inspecteur`, choisis le transport « Streamable HTTP »
et l'URL `http://127.0.0.1:3000/mcp`, puis appelle les outils à la main.

## Les outils

| Outil | Rôle |
| --- | --- |
| `gemini_generer_image` | Crée ou retouche une image (modèles Gemini Image, alias « Nano Banana »). |
| `gemini_lancer_video_veo` | Lance une vidéo Veo 3.1 avec audio : image de départ/fin, références, prolongation. |
| `gemini_lancer_video_omni` | Lance ou **modifie** une vidéo Gemini Omni par instructions successives. |
| `gemini_suivre_video` | Donne l'état d'une vidéo en cours et renvoie le fichier MP4 quand il est prêt. |
| `gemini_analyser_media` | Fait regarder une image ou une vidéo par Gemini (Claude ne voit pas les vidéos). |
| `gemini_lister_modeles` | Liste les modèles accessibles avec ta clé. |

Les fichiers sont enregistrés dans `generations/images/` et `generations/videos/`.

### Comment l'itération fonctionne

Chaque génération renvoie un `interaction_id`. L'assistant le repasse dans `interaction_precedente`
avec un prompt qui décrit **seulement la correction** (« passe la scène de nuit ») : Google garde
le contexte, inutile de renvoyer l'image.

Une vidéo prend de 11 s à 6 min. Pour ne pas bloquer l'assistant, le lancement rend tout de suite un
identifiant de tâche ; `gemini_suivre_video` attend jusqu'à 30 s par appel, puis l'assistant rappelle.

## Coûts

Chaque appel de génération est facturé sur **ta** clé. Tarifs indicatifs (octobre 2026, voir
<https://ai.google.dev/gemini-api/docs/pricing>) :

| Modèle | Prix | Pour 10 $ |
| --- | --- | --- |
| `gemini-3.1-flash-lite-image` | 0,034 $ / image 1K | ≈ 290 images |
| `gemini-3.1-flash-image` | 0,067 $ / image 1K | ≈ 150 images |
| `gemini-3-pro-image` | 0,134 $ / image 1K-2K | ≈ 75 images |
| `veo-3.1-lite-generate-preview` | 0,05 $ / seconde (720p) | ≈ 25 vidéos de 8 s |
| `veo-3.1-fast-generate-preview` | 0,10 $ / seconde (720p) | ≈ 12 vidéos de 8 s |
| `veo-3.1-generate-preview` | 0,40 $ / seconde | ≈ 3 vidéos de 8 s |
| `gemini-omni-1.1-flash` | ≈ 0,10 $ / seconde (720p) | ≈ 12 vidéos de 8 s |

Bonnes pratiques :

- fais tes essais en petit (`taille: "512"`, `resolution: "360p"` pour Omni, modèles `lite` ou `fast`) ;
- surveille ta consommation sur <https://aistudio.google.com> ;
- `gemini_lister_modeles` et `gemini_suivre_video` sont gratuits.

## Dépannage

| Symptôme | Solution |
| --- | --- |
| `GEMINI_API_KEY manquante` alors qu'elle est dans `.env` | Le fichier doit s'appeler exactement `.env` et être à la racine du projet. Relance le serveur. |
| `Clé GEMINI_API_KEY invalide` | Recopie la clé depuis AI Studio, sans espaces ni guillemets. |
| `quota à 0` / `limit: 0 … on Free Tier` | Ta clé est au niveau gratuit, qui exclut la génération : active la facturation. |
| Erreur 403 / « facturation » | Active la facturation sur le projet Google lié à ta clé. |
| Modèle introuvable (404) | Lance `gemini_lister_modeles`, puis mets à jour la liste dans `src/config.js`. |
| `Le chemin … doit être absolu` | Donne le chemin complet du fichier (`/home/moi/…` ou `C:\Users\moi\…`). |
| `EADDRINUSE` au démarrage | Le port 3000 est déjà pris : change `PORT` dans `.env` (et l'URL côté client). |
| L'assistant ne voit pas les outils | Vérifie que le serveur tourne et que l'URL finit bien par `/mcp`. Redémarre le client. |
| `node: .env: not found` | Tu as oublié l'étape 3 de l'installation. |

Les modèles Veo et Omni sont récents chez Google : leurs paramètres peuvent évoluer. Si un appel
échoue, ouvre une [issue](https://github.com/mbakopyves/MCP_ServerGoogleAiStudio/issues) avec le message d'erreur.

## Organisation du code

```text
server.js                     démarre Express
src/config.js                 lit le .env, liste des modèles
src/app.js                    Express + protections localhost, routes /api et /mcp
src/route/  src/controller/   /api (état du serveur) et /mcp (protocole MCP)
src/mcp/serveur.js            crée le serveur MCP et enregistre les outils
src/mcp/tool/*.tool.js        un fichier par famille d'outils
src/service/                  client Gemini, fichiers, tâches vidéo en arrière-plan
```

Construit avec le [SDK MCP TypeScript v2](https://github.com/modelcontextprotocol/typescript-sdk),
[`@google/genai`](https://www.npmjs.com/package/@google/genai), Express 5 et zod.

### Ajouter ton propre outil

1. Crée `src/mcp/tool/mon-outil.tool.js` en t'inspirant de `modele.tool.js` (le plus court) :
   un schéma zod pour les paramètres, une description claire, une fonction qui renvoie
   `reponseTexte(...)` ou `reponseErreur(...)`.
2. Enregistre-le dans `src/mcp/serveur.js`.
3. Redémarre ton client MCP pour qu'il recharge la liste des outils.

La description de l'outil est lue par l'IA : c'est elle qui décide quand l'appeler. Écris-la comme
une consigne à un collègue.

## Sécurité

- Le serveur écoute uniquement sur `127.0.0.1` et refuse les requêtes venant d'un site web
  (vérification des en-têtes `Host` et `Origin`). Il n'a **pas d'authentification** :
  ne l'expose pas sur `0.0.0.0` ni sur Internet.
- Ne commite jamais ton `.env`. Si ta clé fuit, supprime-la sur AI Studio et crée-en une autre.

## Limites

- Les tâches vidéo vivent en mémoire : un redémarrage du serveur les oublie (les fichiers déjà
  enregistrés restent, et les `interaction_id` d'Omni et des images restent valides).
- Une vidéo Veo ne peut être prolongée que pendant 2 jours (durée de conservation chez Google).
- Médias d'entrée : chemins absolus, 20 Mo maximum.

## Licence

[ISC](LICENSE) — libre de l'utiliser, le modifier et le redistribuer.
