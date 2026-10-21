---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "ink-cartridge"
  text: "使用指南"
  tagline: "面向交互密集、多页面终端应用的屏幕系统与分层键盘引擎——增强 Ink，而不是替换它。"
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/quick-start-1
    - theme: alt
      text: API 参考
      link: https://cartridgebox.art/framework/

features:
  - title: 屏幕系统
    details: 任意 React 组件都可以是屏幕。注册成树后用 skip / back / gotoScreen 导航；普通图层与模态层按 zIndex 堆叠，键盘与鼠标优先级随之一致。
  - title: 分层键盘引擎
    details: 绑定归属于当前屏幕或图层元素。九阶段流水线安排模态层屏障、图层广播、全局键与屏幕栈的顺序；焦点组在同一层内路由按键。
  - title: 鼠标与键盘共用一套模型
    details: 鼠标区域与键盘共享层级和焦点。悬停或点击可以提升图层、切换焦点，区域映射在屏幕重渲染之间保持有效。
---
