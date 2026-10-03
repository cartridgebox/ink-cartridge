import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
const base = process.env.DOCS_BASE ?? '/'

// Typedoc publishes each API reference as a sibling section of this guide on GitHub Pages.
const API_DOCS = 'https://baigaoa.github.io/ink-cartridge'
const EDIT_PATTERN = 'https://github.com/BAIGAOa/ink-cartridge/edit/main/website/:path'

const apiNavEn = [
  {
    text: 'API Reference',
    items: [
      { text: 'Framework', link: `${API_DOCS}/framework/` },
      { text: 'Keyboard Engine', link: `${API_DOCS}/engine/` },
      { text: 'i18n', link: `${API_DOCS}/i18n/` },
      { text: 'Theme', link: `${API_DOCS}/theme/` },
      { text: 'Event', link: `${API_DOCS}/event/` }
    ]
  }
]

const apiNavZh = [
  {
    text: 'API 参考',
    items: [
      { text: '框架', link: `${API_DOCS}/framework/` },
      { text: '键盘引擎', link: `${API_DOCS}/engine/` },
      { text: 'i18n', link: `${API_DOCS}/i18n/` },
      { text: '主题', link: `${API_DOCS}/theme/` },
      { text: '事件', link: `${API_DOCS}/event/` }
    ]
  }
]

// Layer chapters carry "next chapter" dependencies, so their relative order is load-bearing.
const sidebarEn = [
  {
    text: 'Guide',
    items: [{ text: 'Quick Start', link: '/quick-start-1' }]
  },
  {
    text: 'Concepts',
    items: [{ text: 'Core Concepts', link: '/concepts/core-model' }]
  },
  {
    text: 'Base',
    items: [
      { text: 'Organize Your Screen', link: '/screen/screen-registry' },
      { text: 'Navigation', link: '/screen/navigation' },
      { text: 'Basic Binding', link: '/keyboard/base-bind' },
      { text: 'Key Names', link: '/keyboard/key-names' },
      { text: 'Intermediate Binding', link: '/keyboard/boundKeyboard-advanced' },
      { text: 'Focus System', link: '/keyboard/focus-system' }
    ]
  },
  {
    text: 'Layers',
    items: [
      { text: 'Layer Basics', link: '/screen/layer-base' },
      { text: 'Keyboard Events Between Layers', link: '/screen/layer-keyboard' },
      { text: 'Layer Element Keyboard', link: '/screen/layer-element-keyboard' },
      { text: 'Modal Layer Basics', link: '/screen/modal-layer-base' },
      { text: 'Modal Layer Keyboard Events', link: '/screen/modal-layer-keyboard' },
      { text: 'Modal Layer Element Keyboard', link: '/screen/modal-layer-element-keyboard' },
      { text: 'Passing Keys with allowModal', link: '/screen/allow-modal' },
      { text: 'Modal Missed Keys', link: '/screen/modal-miss-listener' },
      { text: 'Binding Attribution & the Owner Stack', link: '/screen/binding-attribution' },
      { text: 'Layer z-index', link: '/screen/layer-z-index' }
    ]
  },
  {
    text: 'Keyboard',
    items: [
      { text: 'Focus Groups', link: '/keyboard/focus-group' },
      { text: 'Shortcuts & Actions', link: '/keyboard/shortcuts-actions' },
      { text: 'Multi-key Sequences', link: '/keyboard/boundSequence' },
      { text: 'Stopping Key Propagation', link: '/keyboard/stop' },
      { text: 'Passing Keys Through', link: '/keyboard/penetration' },
      { text: 'Modes', link: '/keyboard/modes' },
      { text: 'Global Key Bindings', link: '/keyboard/global-keys' },
      { text: 'Mapping Keys', link: '/keyboard/mapping-keys' },
      { text: 'Composition Engine', link: '/keyboard/composition' },
      { text: 'Custom Processors', link: '/keyboard/processors' },
      { text: 'Module-level Keyboard API', link: '/keyboard/module-api' },
      { text: 'Using the Engine without React', link: '/keyboard/non-react' }
    ]
  },
  {
    text: 'Mouse',
    items: [
      { text: 'Mouse Region Basics', link: '/mouse/mouse-base' },
      { text: 'Mouse-Driven Keyboard Focus', link: '/mouse/mouse-focus' }
    ]
  },
  {
    text: 'More',
    items: [{ text: 'Troubleshooting', link: '/troubleshooting' }]
  }
]

const sidebarZh = [
  {
    text: '指南',
    items: [{ text: '快速开始', link: '/zh/quick-start-1' }]
  },
  {
    text: '概念',
    items: [{ text: '核心概念', link: '/zh/concepts/core-model' }]
  },
  {
    text: '基础',
    items: [
      { text: '组织屏幕', link: '/zh/screen/screen-registry' },
      { text: '屏幕导航', link: '/zh/screen/navigation' },
      { text: '基本绑定', link: '/zh/keyboard/base-bind' },
      { text: '键名规范', link: '/zh/keyboard/key-names' },
      { text: '中级绑定', link: '/zh/keyboard/boundKeyboard-advanced' },
      { text: '焦点系统', link: '/zh/keyboard/focus-system' }
    ]
  },
  {
    text: '图层',
    items: [
      { text: '普通图层', link: '/zh/screen/layer-base' },
      { text: '图层间的键盘事件', link: '/zh/screen/layer-keyboard' },
      { text: '图层内元素的键盘接收', link: '/zh/screen/layer-element-keyboard' },
      { text: '模态层基础', link: '/zh/screen/modal-layer-base' },
      { text: '模态层键盘事件', link: '/zh/screen/modal-layer-keyboard' },
      { text: '模态层内元素的键盘响应', link: '/zh/screen/modal-layer-element-keyboard' },
      { text: 'allowModal 放行键盘事件', link: '/zh/screen/allow-modal' },
      { text: '监听模态层的丢失键', link: '/zh/screen/modal-miss-listener' },
      { text: '绑定方法的归属与所有者栈', link: '/zh/screen/binding-attribution' },
      { text: '图层层级', link: '/zh/screen/layer-z-index' }
    ]
  },
  {
    text: '键盘',
    items: [
      { text: '默认组与命名组', link: '/zh/keyboard/focus-group' },
      { text: '快捷键与动作', link: '/zh/keyboard/shortcuts-actions' },
      { text: '多键序列', link: '/zh/keyboard/boundSequence' },
      { text: '停止键传播', link: '/zh/keyboard/stop' },
      { text: '键的穿透', link: '/zh/keyboard/penetration' },
      { text: '模式', link: '/zh/keyboard/modes' },
      { text: '全局键绑定', link: '/zh/keyboard/global-keys' },
      { text: '映射键', link: '/zh/keyboard/mapping-keys' },
      { text: '组合引擎', link: '/zh/keyboard/composition' },
      { text: '自定义处理器', link: '/zh/keyboard/processors' },
      { text: '模块级键盘 API', link: '/zh/keyboard/module-api' },
      { text: '在非 React 环境使用引擎', link: '/zh/keyboard/non-react' }
    ]
  },
  {
    text: '鼠标',
    items: [
      { text: '鼠标区域基础', link: '/zh/mouse/mouse-base' },
      { text: '鼠标与键盘焦点联动', link: '/zh/mouse/mouse-focus' }
    ]
  },
  {
    text: '更多',
    items: [{ text: '故障排除', link: '/zh/troubleshooting' }]
  }
]

export default defineConfig({
  base,
  title: 'ink-cartridge',
  description: 'A React Ink component kit for building terminal UIs — layered keyboard engine, screen routing, and full mouse integration.',
  lastUpdated: true,
  themeConfig: {
    logo: '/logo.png',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/BAIGAOa/ink-cartridge' }
    ],
    outline: [2, 3],
    // Search must sit on the root themeConfig: the build-time index plugin reads
    // only this level, so a per-locale `search` produces no index at all.
    search: {
      provider: 'local',
      options: {
        miniSearch: {
          options: {
            // Chinese runs have no spaces, so the default whitespace tokenizer
            // indexes a whole sentence as a single token and queries miss it.
            // Intl.Segmenter splits CJK and Latin alike. It has to be built inside
            // the function: VitePress serializes this one via `new Function`.
            tokenize: (text: string): string[] =>
              [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)]
                .filter((segment) => segment.isWordLike)
                .map((segment) => segment.segment)
          }
        },
        locales: {
          zh: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                displayDetails: '显示详情列表',
                resetButtonTitle: '清除查询条件',
                backButtonTitle: '返回',
                noResultsText: '未找到相关结果',
                footer: {
                  selectText: '选择',
                  selectKeyAriaLabel: '回车键',
                  navigateText: '切换',
                  navigateUpKeyAriaLabel: '上箭头',
                  navigateDownKeyAriaLabel: '下箭头',
                  closeText: '关闭',
                  closeKeyAriaLabel: 'Esc 键'
                }
              }
            }
          }
        }
      }
    },
    editLink: {
      pattern: EDIT_PATTERN,
      text: 'Edit this page on GitHub'
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © ink-cartridge contributors'
    },
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Quick Start', link: '/quick-start-1' },
      ...apiNavEn
    ],
    sidebar: sidebarEn
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en'
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      description: '基于 React Ink 的终端 UI 组件库——分层键盘引擎、屏幕路由与完整鼠标联动。',
      themeConfig: {
        nav: [
          { text: '首页', link: '/zh/' },
          { text: '快速开始', link: '/zh/quick-start-1' },
          ...apiNavZh
        ],
        sidebar: sidebarZh,
        // Locale themeConfig replaces the root object wholesale, so `pattern` repeats here.
        editLink: {
          pattern: EDIT_PATTERN,
          text: '在 GitHub 上编辑此页'
        },
        footer: {
          message: '基于 MIT 许可证发布',
          copyright: 'Copyright © ink-cartridge contributors'
        }
      }
    }
  }
})
