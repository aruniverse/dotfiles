# Restore public skills

Pi packages install their own bundled skills. Other skills on this machine were installed separately from the public sources below. These are source references, not copies of the live skill directories or lockfile.

| Source | Skills used here |
|---|---|
| [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) | Obsidian CLI, Markdown, Bases, JSON Canvas, and Defuddle |
| [mattpocock/skills](https://github.com/mattpocock/skills) | Debugging, testing, prototyping, and teaching |
| [kitlangton/stack](https://github.com/kitlangton/stack) | Stacked pull requests |
| [backnotprop/plannotator](https://github.com/backnotprop/plannotator) | Extra Plannotator skills, including plan analysis and goal setup |
| [plannotator/write-better](https://github.com/plannotator/write-better) | Prose editing |

After installing Node, inspect the upstream content, then run the installer for each collection you want. For example:

```sh
npx skills add kepano/obsidian-skills -g
npx skills add mattpocock/skills -g
npx skills add kitlangton/stack -g
npx skills add backnotprop/plannotator -g
npx skills add plannotator/write-better -g
```

Select the skills and agent targets interactively. Do not install every skill in every collection by default. These commands fetch current upstream content; the sources are not version-pinned, and the dotfiles installer does not run them automatically.

Install Firecrawl's skills through its own documented setup if needed. Rex and Herdr integrations should be regenerated through their respective tools. Do not copy another user's global agent instructions, private skills, broken extension symlinks, credentials, or absolute skill paths into this repository.
