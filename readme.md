# Readme

A crawler to run on scb.se with analysis purpose

## Goals

For first version

- [x] Create sitemap XML file
- [x] Create a JSON site object file
- [x] Create a JSON site array file
- [x] Do basic content parsing
- [x] Scan only limited number of pages

Next version

- [] Add entries to database instead of JSON files
- [] Scan all pages

### Parsing

- Group links of certain types such as main menu, footer
- Find instances of certain block types

### Object JSON

The goal is to create something similar to this

```json
"url-as-key": {
  "title": "",
  "modified": "",
  "template": "listsida",
  "blocks": [],
  "children": []
  ...
}
```

## TODO EpiServer

- [] Unik ID (inte lik Epis egna ID) för var sida exponeras
- [] Sidmall exponeras som metadata



