# gemini-studio-mcp-server

Serveur MCP (HTTP) qui donne à Claude Code, Cursor ou tout client MCP l'accès à la génération
d'images et de vidéos de **Google AI Studio**, avec la possibilité d'itérer sur un résultat.

## Démarrer

```bash
source ~/.nvm/nvm.sh && nvm use        # Node 24 (lu dans .nvmrc) — le SDK Gemini exige Node ≥ 20
cp .env.example .env                   # puis renseigne GEMINI_API_KEY
npm run dev                            # http://127.0.0.1:3000/mcp
```

`GET http://127.0.0.1:3000/api` répond `{"statut":"ok", …}` quand le serveur tourne.

## Brancher un client

**Claude Code** (disponible dans tous tes projets) :

```bash
claude mcp add --transport http --scope user gemini-studio http://127.0.0.1:3000/mcp
```

**Cursor** — `~/.cursor/mcp.json` :

```json
{ "mcpServers": { "gemini-studio": { "url": "http://127.0.0.1:3000/mcp" } } }
```

**Tester à la main** : `npm run inspecteur`, puis transport « Streamable HTTP » et l'URL ci-dessus.

## Outils

| Outil | Rôle |
|---|---|
| `gemini_generer_image` | Crée ou retouche une image ; itère via `interaction_precedente`. |
| `gemini_lancer_video_veo` | Lance une vidéo Veo 3.1 (image de départ/fin, références, prolongation). |
| `gemini_lancer_video_omni` | Lance ou **modifie** une vidéo Gemini Omni, par instructions successives. |
| `gemini_suivre_video` | État d'une tâche vidéo ; renvoie le fichier MP4 quand il est prêt. |
| `gemini_analyser_media` | Fait regarder une image/vidéo par Gemini (Claude ne voit pas les vidéos). |
| `gemini_lister_modeles` | Modèles disponibles pour la clé. |

Les fichiers générés sont écrits dans `generations/images` et `generations/videos`.

## Organisation

```
server.js                      démarre Express
src/config.js                  lit le .env, liste des modèles
src/app.js                     Express + protections localhost, routes /api et /mcp
src/route/  src/controller/    /api (état) et /mcp (protocole MCP)
src/mcp/serveur.js             crée le serveur MCP et enregistre les outils
src/mcp/tool/*.tool.js         un fichier par famille d'outils
src/service/                   client Gemini, fichiers, tâches vidéo en arrière-plan
```

## Limites à connaître

- **Facturation** : chaque génération est facturée sur la clé. Veo et les modèles « Pro »
  demandent la facturation activée sur le projet Google lié.
- **Tâches vidéo en mémoire** : un redémarrage du serveur oublie les tâches en cours
  (les fichiers déjà enregistrés restent). Les `interaction_id` d'Omni et des images restent valides.
- **Prolonger une vidéo Veo** n'est possible que 2 jours après sa création (durée de conservation chez Google).
- Médias d'entrée : chemins **absolus**, 20 Mo maximum.
- Le serveur n'écoute que sur `127.0.0.1`, sans authentification : ne le mets pas sur `0.0.0.0`.
