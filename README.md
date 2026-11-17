# 入站与链式代理

[GUI.for.Clash](https://github.com/GUI-for-Cores/GUI.for.Clash) 插件。把官方「策略组入站设置」和「链式代理支持」的功能合到同一页，让入站端口可以直接绑定一条链式代理。

## 功能

- 在同一页面配置链式代理（出口节点 + 前置跳）和入站端口
- 入站可绑定策略组、链式代理、子规则或全局规则
- 支持 HTTP / SOCKS / Mixed 入站，以及 UDP、认证方式
- 生成配置时会把订阅文件中的节点一并纳入链式规则，避免节点尚未展开导致核心无法启动
- 在「设置 → 插件」中展示当前入站地址与端口摘要
- 插件 ID 使用 `inbound-chain`，避免被 GUI.for.Clash 误标记为「已废弃」

## 安装

1. 复制 `plugin-inbound-chain.js` 到 GUI.for.Clash 数据目录的 `plugins` 文件夹。非便携版通常是：

   `~/.local/share/GUI.for.Clash/plugins/plugin-inbound-chain.js`

2. 在「插件」页添加本地插件，建议按以下填写：

   - ID：`inbound-chain`（不要使用 `plugin-` 前缀）
   - 名称：入站与链式代理
   - 类型：File
   - 路径：`data/plugins/plugin-inbound-chain.js`
   - 触发器：`on::manual`、`on::generate`、`on::ready`、`on::uninstall`

3. 禁用官方的「策略组入站设置」和「链式代理支持」，避免重复注入入站或 `dialer-proxy`。

4. 重新打开 GUI.for.Clash，运行本插件，保存后再**生成配置并重启核心**。只点保存不会改正在运行的配置。

## 使用注意

- 链式配置里的节点必须出现在当前配置或对应订阅文件中。
- 测试 Mixed 入站时，若 `curl -x http://127.0.0.1:端口` 出现 TLS 握手失败，可改用：

  ```bash
  curl -x socks5h://127.0.0.1:端口 https://ipinfo.io/json
  ```

- 设置页中的「监听地址与端口」只是摘要，改那里不会增删真正的入站。请在插件页面里修改。

## 许可证

MIT
