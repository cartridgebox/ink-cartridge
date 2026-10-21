---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "ink-cartridge"
  text: "Guides"
  tagline: "A screen system and layered keyboard engine for interaction-dense, multi-page terminal UIs — built on Ink, not in place of it."
  actions:
    - theme: brand
      text: Quick Start
      link: /quick-start-1
    - theme: alt
      text: API Reference
      link: https://cartridgebox.art/framework/

features:
  - title: Screen system
    details: Any React component can be a screen. Register a tree and navigate with skip / back / gotoScreen; ordinary and modal layers stack by zIndex with matching keyboard and mouse priority.
  - title: Layered keyboard engine
    details: Bindings belong to the current screen or layer element. A nine-stage pipeline orders the modal barrier, layer broadcast, global keys, and the screen stack; focus groups route keys within a layer.
  - title: Mouse and keyboard, one model
    details: Mouse regions share z-order and focus with the keyboard. Hover or click can raise a layer or move focus, and the region table survives screen re-renders.
---
