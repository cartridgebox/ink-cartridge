---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "ink-cartridge"
  text: "使用指南"
  tagline: "增强而非替换 Ink——为交互密集型终端 UI 提供基础交互层：屏幕系统、分层键盘引擎与完整鼠标联动。"
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/quick-start-1
    - theme: alt
      text: API 参考
      link: https://cartridgebox.art/framework/

features:
  - title: 分层键盘引擎
    details: 九级流水线协调模态层、普通层、全局键与屏幕栈的按键冲突；每屏拥有独立绑定，聚焦系统在同一层内划分按键，还支持 vim 风格映射与组合键序列。
  - title: 完整的鼠标联动
    details: useMouseRegion 提供点击、悬停、拖拽，鼠标与键盘焦点完全协同——悬停窗口自动置顶，键盘优先级与窗口层级严格对齐。
  - title: 屏幕路由
    details: 组件即屏幕，注册进树后用 skip / back / gotoScreen 跳转（LCA 寻径）；普通层与模态层支持开合、元素应用与层级管理。
---
