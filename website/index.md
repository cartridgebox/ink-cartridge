---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "ink-cartridge"
  text: "Guides"
  tagline: "Enhances Ink without replacing it — the foundational interaction layer for interaction-dense terminal UIs: screen system, layered keyboard engine, and full mouse integration."
  actions:
    - theme: brand
      text: Quick Start
      link: /quick-start-1
    - theme: alt
      text: API Reference
      link: https://cartridgebox.art/framework/

features:
  - title: Layered Keyboard Engine
    details: A 9-stage pipeline resolves conflicts between modal layers, layers, global keys, and the screen stack. Each screen owns its bindings; the focus system partitions keys within a layer, with vim-style remapping and sequence composition.
  - title: Full Mouse Integration
    details: useMouseRegion provides click, hover, and drag. Mouse and keyboard focus work in full coordination — hovering raises the window, and keyboard priority stays exactly aligned with window z-order.
  - title: Screen Routing
    details: Any component can be a screen. Register it into a tree and navigate with skip / back / gotoScreen (LCA routing). Ordinary and modal layers support open/close, element application, and z-index management.
---

