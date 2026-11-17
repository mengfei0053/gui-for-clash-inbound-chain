const PATH = 'data/third/inbound-chain'
const CONFIG_FILE = `${PATH}/settings.json`
const LEGACY_LISTENER_FILE = 'data/third/strategy-group-listener/settings.json'
const LEGACY_CHAIN_DIR = 'data/third/proxy-chain-manager'
const LISTENER_PREFIX = 'inbound-chain-'
const DEFAULT_PORT = 7898
const DEFAULT_LISTEN = '127.0.0.1'
const TEST_URL = 'https://ipinfo.io/json'
const LISTENER_TYPES = ['http', 'socks', 'mixed']
const OUTBOUND_MODES = ['proxy', 'chain', 'rule', 'global']
const AUTH_MODES = ['global', 'custom', 'none']
const HEADER_ACTION_ID = `${Plugin.id}_profiles_header`
const STABLE_PLUGIN_ID = 'inbound-chain'
const LISTEN_SUMMARY_KEY = 'ListenAddresses'
const LISTEN_SUMMARY_CONFIG = {
  id: 'ID_listenaddrs',
  title: '监听地址与端口',
  description: '由插件页面管理，修改请打开「入站与链式代理」',
  key: LISTEN_SUMMARY_KEY,
  component: 'Input',
  value: '',
  options: []
}

const onReady = async () => {
  addProfilesHeaderAction()
  await syncListenSummary()
}

const onDispose = () => {
  removeProfilesHeaderAction()
}

const onRun = async () => {
  const profilesStore = Plugins.useProfilesStore()
  if (profilesStore.profiles.length === 0) throw '请先创建一个配置'

  const profile =
    profilesStore.profiles.length === 1
      ? profilesStore.profiles[0]
      : await Plugins.picker.single(
          '请选择要配置的 Clash 配置',
          profilesStore.profiles.map((v) => ({
            label: v.name,
            value: v
          })),
          [profilesStore.profiles[0]]
        )

  if (!profile) return
  await showUI(profile)
}

const openCurrentProfile = async () => {
  const profilesStore = Plugins.useProfilesStore()
  const profile = profilesStore.currentProfile || (profilesStore.profiles.length === 1 ? profilesStore.profiles[0] : null)
  if (profile) return await showUI(profile)
  return await onRun()
}

const showUI = async (profile) => {
  const groups = getProfileGroups(profile)
  if (groups.length === 0) throw '当前配置没有可选择的策略组'

  const settings = await loadProfileSettings(profile)
  const generatedConfig = await getGeneratedConfig(profile)
  const subRuleOptions = Object.keys(generatedConfig['sub-rules'] || {}).map((name) => ({ label: name, value: name }))
  const reservedPorts = getUsedPorts(generatedConfig)
  const entityOptions = getEntityOptions(profile)

  const rows = Vue.ref(settings.listeners.map((listener) => normalizeListener(listener, groups, subRuleOptions, settings.chains)))
  const chains = Vue.ref(settings.chains.map((chain) => normalizeChain(chain, entityOptions)))

  const typeOptions = [
    { label: 'HTTP', value: 'http' },
    { label: 'SOCKS', value: 'socks' },
    { label: 'Mixed', value: 'mixed' }
  ]
  const outboundOptions = [
    { label: '绑定策略组', value: 'proxy' },
    { label: '绑定链式代理', value: 'chain' },
    { label: '使用子规则', value: 'rule' },
    { label: '使用全局规则', value: 'global' }
  ]
  const authOptions = [
    { label: '继承全局', value: 'global' },
    { label: '独立认证', value: 'custom' },
    { label: '不启用认证', value: 'none' }
  ]
  const ruleInputModeOptions = [
    { label: '选择', value: 'select' },
    { label: '手填', value: 'manual' }
  ]
  const groupOptions = groups.map((group) => ({ label: group.name, value: group.id }))

  const component = {
    template: `
    <div class="flex flex-col gap-12 pb-8 pr-8">
      <div>
        <div class="text-16 font-bold">{{ profile.name }}</div>
        <div class="text-12 text-gray-500">配置链式代理，并把入站端口直接绑定到某条链、策略组、子规则或全局规则</div>
      </div>

      <div class="flex items-center justify-between">
        <div class="font-bold text-16">链式代理</div>
        <Button type="primary" icon="add" @click="addChain">添加链式配置</Button>
      </div>

      <div v-if="chains.length === 0" class="flex items-center justify-center min-h-[120px] border border-dashed rounded-4">
        <div class="text-12 text-gray-500">还没有链式配置。添加后，入站就可以直接选择这条链。</div>
      </div>

      <Card v-for="(chain, index) in chains" :key="chain.id" :title="chain.name || ('链式配置 ' + (index + 1))">
        <template #extra>
          <Button icon="delete" type="text" @click.stop="removeChain(index)" />
        </template>
        <div class="grid gap-12" style="grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));">
          <div style="grid-column: 1 / -1;" class="text-12 text-gray-500">{{ renderChainPath(chain) }}</div>
          <div class="grid items-center gap-8" style="grid-template-columns: 96px minmax(0, 1fr);">
            <div class="text-12 text-gray-500">名称</div>
            <div class="min-w-0">
              <Input v-model="chain.name" placeholder="例如 链式US" />
            </div>
          </div>
          <div class="grid items-center gap-8" style="grid-template-columns: 96px minmax(0, 1fr);">
            <div class="text-12 text-gray-500">出口节点</div>
            <div class="min-w-0">
              <Select v-model="chain.exitId" :options="entityOptions" />
            </div>
          </div>
          <div v-for="(hopId, hopIndex) in chain.hopIds" :key="chain.id + '-hop-' + hopIndex" class="grid items-center gap-8" style="grid-template-columns: 96px minmax(0, 1fr) auto; grid-column: 1 / -1;">
            <div class="text-12 text-gray-500">{{ hopIndex === 0 ? '前置代理' : '再往前一跳' }}</div>
            <div class="min-w-0">
              <Select v-model="chain.hopIds[hopIndex]" :options="entityOptions" />
            </div>
            <Button v-if="chain.hopIds.length > 1" icon="delete" type="text" @click="removeHop(chain, hopIndex)" />
          </div>
          <div style="grid-column: 1 / -1;">
            <Button type="link" size="small" @click="addHop(chain)">再加一跳</Button>
          </div>
        </div>
      </Card>

      <div class="flex items-center justify-between">
        <div class="font-bold text-16">入站端口</div>
        <div class="flex items-center gap-8">
          <Button icon="search" @click="checkLocalPorts">检查本机端口占用</Button>
          <Button type="primary" icon="add" @click="addListener">新增入站</Button>
        </div>
      </div>

      <div v-if="rows.length === 0" class="flex items-center justify-center min-h-[180px] border border-dashed rounded-4">
        <Button type="primary" icon="add" @click="addListener">添加入站</Button>
      </div>

      <div v-else class="flex flex-col gap-8">
        <Card v-for="(row, index) in rows" :key="row.id" :title="row.name || '入站 ' + (index + 1)">
          <template #extra>
            <div class="flex items-center gap-8">
              <Switch v-model="row.enabled">启用</Switch>
              <Button icon="code" type="text" @click.stop="copyTestCommand(row)">复制测试命令</Button>
              <Button icon="delete" type="text" @click.stop="removeListener(index)" />
            </div>
          </template>

          <div class="grid gap-12" style="grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));">
            <div style="grid-column: 1 / -1;">
              <div class="text-12 text-gray-500">{{ getListenerSummary(row, chains) }}</div>
              <Tag v-if="isDuplicatePort(rows, row, index)" color="red" class="mt-4">监听端口重复</Tag>
              <Tag v-else-if="isReservedPort(row)" color="red" class="mt-4">端口已被当前配置占用</Tag>
            </div>

            <div class="grid items-center gap-8" style="grid-template-columns: 96px minmax(0, 1fr);">
              <div class="text-12 text-gray-500">名称</div>
              <div class="min-w-0">
                <Input v-model="row.name" placeholder="AI HTTP" />
              </div>
            </div>
            <div class="grid items-center gap-8" style="grid-template-columns: 96px minmax(0, 1fr);">
              <div class="text-12 text-gray-500">类型</div>
              <div class="min-w-0">
                <Select v-model="row.type" :options="typeOptions" />
              </div>
            </div>
            <div class="grid items-center gap-8" style="grid-template-columns: 96px minmax(0, 1fr);">
              <div class="text-12 text-gray-500">监听地址</div>
              <div class="min-w-0">
                <Input v-model="row.listen" placeholder="127.0.0.1" />
              </div>
            </div>
            <div class="grid items-center gap-8" style="grid-template-columns: 96px minmax(0, 1fr);">
              <div class="text-12 text-gray-500">监听端口</div>
              <div class="min-w-0">
                <Input v-model="row.port" placeholder="7898" />
              </div>
            </div>

            <div class="grid items-center gap-8" style="grid-template-columns: 96px minmax(0, 1fr);">
              <div class="text-12 text-gray-500">出站方式</div>
              <div class="min-w-0">
                <Select v-model="row.outboundMode" :options="outboundOptions" />
              </div>
            </div>
            <div v-if="row.outboundMode === 'proxy'" class="grid items-center gap-8" style="grid-template-columns: 96px minmax(0, 1fr);">
              <div class="text-12 text-gray-500">绑定策略组</div>
              <div class="min-w-0">
                <Select v-model="row.groupId" :options="groupOptions" />
              </div>
            </div>
            <div v-if="row.outboundMode === 'chain'" class="grid items-center gap-8" style="grid-template-columns: 96px minmax(0, 1fr);">
              <div class="text-12 text-gray-500">绑定链式代理</div>
              <div class="min-w-0">
                <Select v-if="chainOptions.length > 0" v-model="row.chainId" :options="chainOptions" />
                <div v-else class="text-12 text-gray-500">请先在上方添加一条链式配置</div>
              </div>
            </div>
            <div v-if="row.outboundMode === 'rule'" class="grid items-center gap-8" style="grid-template-columns: 96px minmax(0, 1fr);">
              <div class="text-12 text-gray-500">子规则名称</div>
              <div class="grid gap-8 min-w-0" :style="{ gridTemplateColumns: subRuleOptions.length > 0 ? '112px minmax(0, 1fr)' : 'minmax(0, 1fr)' }">
                <Select v-if="subRuleOptions.length > 0" v-model="row.ruleInputMode" :options="ruleInputModeOptions" />
                <Select v-if="subRuleOptions.length > 0 && row.ruleInputMode !== 'manual'" v-model="row.rule" :options="subRuleOptions" />
                <Input v-else v-model="row.rule" placeholder="sub-rule-name" />
              </div>
            </div>
            <div v-if="row.type !== 'http'" class="grid items-center gap-8" style="grid-template-columns: 96px minmax(0, 1fr);">
              <div class="text-12 text-gray-500">UDP</div>
              <div class="min-w-0">
                <Switch v-model="row.udp">开启</Switch>
              </div>
            </div>

            <div class="grid items-center gap-8" style="grid-template-columns: 96px minmax(0, 1fr);">
              <div class="text-12 text-gray-500">认证模式</div>
              <div class="min-w-0">
                <Select v-model="row.authMode" :options="authOptions" />
              </div>
            </div>
            <div v-if="row.authMode === 'custom'" class="grid items-start gap-8" style="grid-template-columns: 96px minmax(0, 1fr); grid-column: 1 / -1;">
              <div class="text-12 text-gray-500 pt-8">用户名 / 密码</div>
              <div class="min-w-0">
                <KeyValueEditor v-model="row.users" :placeholder="['用户名', '密码']" />
              </div>
            </div>
            <Tag v-if="row.authMode === 'none' && isUnsafeNoAuth(row)" color="red" style="grid-column: 1 / -1;">
              当前监听地址会暴露到局域网，请谨慎使用无认证模式
            </Tag>
          </div>
        </Card>
      </div>
    </div>
    `,
    setup() {
      const chainOptions = Vue.computed(() =>
        chains.value
          .map((chain) => {
            const name = String(chain.name || '').trim() || renderChainPath(chain)
            return name ? { label: name, value: chain.id } : null
          })
          .filter(Boolean)
      )

      const addListener = () => {
        rows.value.push(createListener(groups, rows.value, reservedPorts, chains.value))
      }

      const removeListener = (index) => {
        rows.value.splice(index, 1)
      }

      const addChain = () => {
        chains.value.push(createChain())
      }

      const removeChain = (index) => {
        const removed = chains.value.splice(index, 1)[0]
        rows.value.forEach((row) => {
          if (row.chainId === removed?.id) row.chainId = ''
        })
      }

      const addHop = (chain) => {
        chain.hopIds.push('')
      }

      const removeHop = (chain, hopIndex) => {
        if (chain.hopIds.length <= 1) return
        chain.hopIds.splice(hopIndex, 1)
      }

      const checkLocalPorts = async () => {
        const ports = [
          ...new Set(
            rows.value
              .filter((row) => row.enabled !== false)
              .map((row) => Number(row.port))
              .filter(Boolean)
          )
        ]
        if (ports.length === 0) {
          Plugins.message.info('没有需要检查的端口')
          return
        }

        const results = await checkTcpPorts(ports)
        await Plugins.alert('本机 TCP 端口检查', renderPortCheckResults(results), { type: 'markdown' })
      }

      const copyTestCommand = async (row) => {
        try {
          await Plugins.ClipboardSetText(buildCurlCommand(row))
          Plugins.message.success('测试命令已复制')
        } catch (error) {
          Plugins.message.error(error.message || error)
        }
      }

      return {
        profile,
        rows,
        chains,
        entityOptions,
        chainOptions,
        typeOptions,
        outboundOptions,
        authOptions,
        ruleInputModeOptions,
        groupOptions,
        subRuleOptions,
        addListener,
        removeListener,
        addChain,
        removeChain,
        addHop,
        removeHop,
        checkLocalPorts,
        copyTestCommand,
        getListenerSummary,
        renderChainPath: (chain) => renderChainPath(chain, entityOptions),
        isDuplicatePort,
        isReservedPort: (row) => row.enabled !== false && reservedPorts.has(Number(row.port)),
        isUnsafeNoAuth
      }
    }
  }

  const modal = Plugins.modal(
    {
      title: Plugin.name,
      width: '86',
      height: '86',
      async onOk() {
        const savedChains = validateChains(chains.value, entityOptions)
        const listeners = validateListeners(rows.value, groups, savedChains)
        const occupied = listeners.find((listener) => listener.enabled !== false && reservedPorts.has(listener.port))
        if (occupied) throw `端口 ${occupied.port} 已被当前配置占用，请更换端口后再保存`

        const unsafe = listeners.find((listener) => listener.enabled !== false && isUnsafeNoAuth(listener))
        if (unsafe) {
          const ok = await Plugins.confirm('安全提示', '存在监听地址为 0.0.0.0 / :: 且不启用认证的入站，可能会将代理暴露到局域网。确定要保存吗？').catch(
            () => false
          )
          if (!ok) throw '已取消保存'
        }

        const all = await readSettings()
        all[profile.id] = { listeners, chains: savedChains }
        await writeSettings(all)
        Plugins.message.success('已保存，请生成配置并重启核心后生效')
      }
    },
    {
      default: () => Vue.h(component)
    }
  )

  modal.open()
}

const onGenerate = async (config, profile) => {
  const settings = await loadProfileSettings(profile)
  await applyChains(config, profile, settings.chains)

  const listeners = settings.listeners.filter((listener) => listener.enabled !== false)
  config.listeners = (config.listeners || []).filter((listener) => !String(listener.name || '').startsWith(LISTENER_PREFIX))

  if (listeners.length === 0) return config

  const usedPorts = getUsedPorts(config)
  for (const listener of listeners) {
    const port = parsePort(listener.port)
    assertPortAvailable(port, usedPorts)
    usedPorts.add(port)

    const item = {
      name: makeListenerName(listener),
      type: normalizeType(listener.type),
      port,
      listen: normalizeListen(listener.listen)
    }

    if (item.type !== 'http') {
      item.udp = listener.udp !== false
    }

    applyOutbound(item, listener, config, profile, settings.chains)
    applyAuth(item, listener)
    config.listeners.push(item)
  }

  return config
}

const onUninstall = async () => {
  await Plugins.ignoredError(Plugins.RemoveFile, PATH)
}

const addProfilesHeaderAction = () => {
  const appStore = Plugins.useAppStore()
  appStore.removeCustomActions('profiles_header', HEADER_ACTION_ID)
  appStore.addCustomActions('profiles_header', {
    id: HEADER_ACTION_ID,
    component: 'Button',
    componentProps: {
      type: 'link',
      onClick: openCurrentProfile
    },
    componentSlots: {
      default: '入站与链式'
    }
  })
}

const removeProfilesHeaderAction = () => {
  Plugins.useAppStore().removeCustomActions('profiles_header', HEADER_ACTION_ID)
}

const getProfileGroups = (profile) => {
  return (profile.proxyGroupsConfig || []).map((group) => ({
    id: group.id,
    name: group.name
  }))
}

const getEntityMap = (profile) => {
  const map = new Map()
  for (const item of getEntityOptions(profile)) {
    map.set(item.value, item)
  }
  return map
}

const getEntityOptions = (profile) => {
  const subscribesStore = Plugins.useSubscribesStore()
  const options = []
  const seen = new Set()

  const push = (id, name, suffix) => {
    if (!id || !name || seen.has(id)) return
    seen.add(id)
    options.push({
      label: suffix ? `${name}（${suffix}）` : name,
      value: id,
      name
    })
  }

  for (const group of profile.proxyGroupsConfig || []) {
    push(group.id, group.name, '策略组')
  }

  const subIds = [...new Set((profile.proxyGroupsConfig || []).flatMap((group) => group.use || []))]
  for (const subId of subIds) {
    const sub = subscribesStore.getSubscribeById(subId)
    if (!sub) continue
    for (const proxy of sub.proxies || []) {
      push(proxy.id, proxy.name, sub.name)
    }
  }

  return options
}

const getGeneratedConfig = async (profile) => {
  try {
    return await Plugins.generateConfig(profile)
  } catch (error) {
    console.warn(`[${Plugin.name}] 生成配置预览失败`, error)
    return {}
  }
}

const loadProfileSettings = async (profile) => {
  const settings = await readSettings()
  if (settings[profile.id] && (settings[profile.id].listeners || settings[profile.id].chains)) {
    return normalizeProfileSetting(settings[profile.id], profile)
  }

  const migrated = await migrateLegacySettings(profile)
  if (migrated.listeners.length || migrated.chains.length) {
    settings[profile.id] = migrated
    await writeSettings(settings)
  }
  return migrated
}

const normalizeProfileSetting = (setting, profile) => {
  const entityOptions = profile ? getEntityOptions(profile) : []
  const groups = profile ? getProfileGroups(profile) : []
  const raw = setting && typeof setting === 'object' ? setting : {}
  const chains = Array.isArray(raw.chains) ? raw.chains.map((chain) => normalizeChain(chain, entityOptions)) : []
  const listeners = Array.isArray(raw.listeners) ? raw.listeners : []
  return {
    chains,
    listeners: listeners.map((listener) => normalizeListener(listener, groups, [], chains))
  }
}

const normalizeChain = (chain, entityOptions = []) => {
  const hopIds = Array.isArray(chain?.hopIds) ? chain.hopIds.map((id) => String(id || '')) : []
  if (chain?.dialerId && hopIds.length === 0) hopIds.push(String(chain.dialerId))
  if (hopIds.length === 0) hopIds.push('')
  const exitId = String(chain?.exitId || '')
  const name = String(chain?.name || '').trim() || autoChainName(exitId, hopIds, entityOptions)
  return {
    id: chain?.id || createId(),
    name,
    exitId,
    hopIds
  }
}

const createChain = () => {
  return {
    id: createId(),
    name: '',
    exitId: '',
    hopIds: ['']
  }
}

const autoChainName = (exitId, hopIds, entityOptions) => {
  const exitName = findEntityName(exitId, entityOptions)
  const hopName = findEntityName((hopIds || []).find(Boolean), entityOptions)
  if (exitName && hopName) return `${exitName} ← ${shortName(hopName)}`
  return exitName || ''
}

const findEntityName = (id, entityOptions) => {
  if (!id) return ''
  return entityOptions.find((item) => item.value === id)?.name || ''
}

const shortName = (name) => {
  const text = String(name || '')
  const match = text.match(/c2s\d+/i)
  if (match) return match[0]
  return text.length > 24 ? `${text.slice(0, 24)}…` : text
}

const renderChainPath = (chain, entityOptions) => {
  const options = entityOptions || getCurrentEntityOptionsFallback(chain)
  const exitName = findEntityName(chain.exitId, options) || chain.exitId || '未选出站'
  const hops = (chain.hopIds || []).map((id) => findEntityName(id, options) || id || '未选前置').filter(Boolean)
  if (!hops.length) return `请求 → ${exitName} → 目标`
  return `请求 → ${hops.slice().reverse().join(' → ')} → ${exitName} → 目标`
}

const getCurrentEntityOptionsFallback = () => []

const normalizeListener = (listener, groups, subRuleOptions = [], chains = []) => {
  const type = normalizeType(listener.type)
  const port = String(listener.port || nextAvailablePort([]))
  const group = groups.find((item) => item.id === listener.groupId || item.name === listener.groupName) || groups[0] || { id: '', name: '' }
  const outboundMode = OUTBOUND_MODES.includes(listener.outboundMode)
    ? listener.outboundMode
    : listener.chainId
      ? 'chain'
      : listener.groupId || listener.groupName
        ? 'proxy'
        : 'global'
  const users = normalizeUsersInput(listener.users)
  const authMode = AUTH_MODES.includes(listener.authMode)
    ? listener.authMode
    : Array.isArray(listener.users) && listener.users.length === 0
      ? 'none'
      : Object.keys(users).length > 0
        ? 'custom'
        : 'global'
  const rule = String(listener.rule || '')
  const hasRuleOption = subRuleOptions.some((item) => item.value === rule)
  const chain = chains.find((item) => item.id === listener.chainId) || chains[0]

  return {
    id: listener.id || createId(),
    enabled: listener.enabled !== false,
    name: String(listener.name || `${type.toUpperCase()} ${port}`),
    type,
    listen: normalizeListen(listener.listen),
    port,
    outboundMode,
    groupId: group.id,
    groupName: group.name,
    chainId: listener.chainId || (outboundMode === 'chain' ? chain?.id || '' : ''),
    rule,
    ruleInputMode: listener.ruleInputMode === 'manual' || (rule && !hasRuleOption) ? 'manual' : 'select',
    udp: listener.udp !== false,
    authMode,
    users
  }
}

const createListener = (groups, listeners, reservedPorts = new Set(), chains = []) => {
  const port = nextAvailablePort(listeners, reservedPorts)
  const group = groups[0] || { id: '', name: '' }
  const chain = chains[0]
  return {
    id: createId(),
    enabled: true,
    name: `Mixed ${port}`,
    type: 'mixed',
    listen: DEFAULT_LISTEN,
    port: String(port),
    outboundMode: chain ? 'chain' : 'proxy',
    groupId: group.id,
    groupName: group.name,
    chainId: chain?.id || '',
    rule: '',
    ruleInputMode: 'select',
    udp: true,
    authMode: 'global',
    users: {}
  }
}

const validateChains = (chains, entityOptions) => {
  const usedExits = new Set()
  return chains.map((chain, index) => {
    const name = String(chain.name || '').trim() || autoChainName(chain.exitId, chain.hopIds, entityOptions) || `链式配置 ${index + 1}`
    const exitId = String(chain.exitId || '').trim()
    const hopIds = (chain.hopIds || []).map((id) => String(id || '').trim()).filter(Boolean)

    if (!exitId) throw `「${name}」请选择出口节点`
    if (hopIds.length === 0) throw `「${name}」请至少选择一个前置代理`
    if (!entityOptions.find((item) => item.value === exitId)) throw `「${name}」出口节点无效`
    for (const hopId of hopIds) {
      if (!entityOptions.find((item) => item.value === hopId)) throw `「${name}」前置代理无效`
    }

    const ids = [exitId, ...hopIds]
    if (new Set(ids).size !== ids.length) throw `「${name}」链路中有重复节点，请勿循环引用`

    if (usedExits.has(exitId)) throw `多个链式配置使用了同一个出口节点，请拆开或删掉重复项`
    usedExits.add(exitId)

    return {
      id: chain.id || createId(),
      name,
      exitId,
      hopIds,
      exitName: findEntityName(exitId, entityOptions),
      hopNames: hopIds.map((id) => findEntityName(id, entityOptions))
    }
  })
}

const validateListeners = (listeners, groups, chains) => {
  const usedPorts = new Set()

  return listeners.map((listener, index) => {
    const enabled = listener.enabled !== false
    const type = normalizeType(listener.type)
    const port = parsePort(listener.port)
    const outboundMode = OUTBOUND_MODES.includes(listener.outboundMode) ? listener.outboundMode : 'proxy'
    const authMode = AUTH_MODES.includes(listener.authMode) ? listener.authMode : 'global'
    const name = String(listener.name || `入站 ${index + 1}`).trim()

    if (enabled) {
      if (usedPorts.has(port)) throw `监听端口 ${port} 重复，请修改后再保存`
      usedPorts.add(port)
    }

    if (outboundMode === 'proxy' && !groups.find((item) => item.id === listener.groupId)) {
      throw '请选择有效的策略组'
    }

    if (outboundMode === 'chain' && !chains.find((item) => item.id === listener.chainId)) {
      throw '请选择有效的链式代理'
    }

    if (outboundMode === 'rule' && !String(listener.rule || '').trim()) {
      throw '请填写子规则名称'
    }

    if (authMode === 'custom' && buildUsers(listener).length === 0) {
      throw '独立认证至少需要填写一组用户名和密码'
    }

    const group = groups.find((item) => item.id === listener.groupId) || groups[0] || { id: '', name: '' }
    const chain = chains.find((item) => item.id === listener.chainId)

    return {
      id: listener.id || createId(),
      enabled,
      name,
      type,
      listen: normalizeListen(listener.listen),
      port,
      outboundMode,
      groupId: group.id,
      groupName: group.name,
      chainId: chain?.id || '',
      chainName: chain?.name || '',
      rule: String(listener.rule || '').trim(),
      ruleInputMode: listener.ruleInputMode === 'manual' ? 'manual' : 'select',
      udp: listener.udp !== false,
      authMode,
      users: normalizeUsersInput(listener.users)
    }
  })
}

const normalizeType = (type) => {
  return LISTENER_TYPES.includes(type) ? type : 'mixed'
}

const readSubscribeProxies = async (path) => {
  if (!path) return []
  const raw = await Plugins.ReadFile(path).catch(() => '')
  if (!raw) return []
  try {
    const parsed = Plugins.YAML.parse(raw)
    return Array.isArray(parsed?.proxies) ? parsed.proxies : []
  } catch {
    return []
  }
}

const collectProxyMap = async (config, profile) => {
  const map = new Map()
  const add = (proxy) => {
    if (proxy?.name && !map.has(proxy.name)) map.set(proxy.name, proxy)
  }

  for (const proxy of config.proxies || []) add(proxy)

  const subscribesStore = Plugins.useSubscribesStore()
  const subIds = new Set([
    ...Object.keys(config['proxy-providers'] || {}),
    ...(profile.proxyGroupsConfig || []).flatMap((group) => group.use || [])
  ])

  for (const subId of subIds) {
    const sub = subscribesStore.getSubscribeById(subId)
    const provider = (config['proxy-providers'] || {})[subId]
    const path = sub?.path || provider?.path
    const proxies = await readSubscribeProxies(path)
    proxies.forEach(add)
  }

  return map
}

const applyChains = async (config, profile, chains) => {
  if (!chains.length) return

  const entityMap = getEntityMap(profile)
  const nameOf = (id, fallback) => entityMap.get(id)?.name || fallback || ''
  const proxiesMap = await collectProxyMap(config, profile)
  const groups = config['proxy-groups'] || []

  for (const chain of chains) {
    const ids = [chain.exitId, ...(chain.hopIds || [])]
    const names = ids.map((id, index) => {
      const fallback = index === 0 ? chain.exitName : chain.hopNames?.[index - 1]
      const name = nameOf(id, fallback)
      if (!name) throw `[${Plugin.name}] 链式配置「${chain.name}」找不到节点`
      return name
    })

    for (let i = 0; i < names.length; i++) {
      const name = names[i]
      const inProxies = proxiesMap.get(name)
      const inGroups = groups.find((item) => item.name === name)
      if (!inProxies && !inGroups) {
        throw `[${Plugin.name}] 链式配置「${chain.name}」的节点未出现在当前配置中：${name}`
      }
      if (i < names.length - 1) {
        const current = inProxies || inGroups
        current['dialer-proxy'] = names[i + 1]
      }
    }
  }

  config.proxies = [...proxiesMap.values()]
}

const applyOutbound = (item, listener, config, profile, chains = []) => {
  const outboundMode = OUTBOUND_MODES.includes(listener.outboundMode) ? listener.outboundMode : 'proxy'

  if (outboundMode === 'proxy') {
    const groupName = getCurrentGroupName(profile, listener)
    if (!groupName || !hasProxyOrGroup(config, groupName)) {
      throw `[${Plugin.name}] 策略组不存在：${listener.groupName || listener.groupId}`
    }
    item.proxy = groupName
    return
  }

  if (outboundMode === 'chain') {
    const chain = chains.find((item) => item.id === listener.chainId)
    if (!chain) throw `[${Plugin.name}] 链式代理不存在：${listener.chainName || listener.chainId}`
    const entityMap = getEntityMap(profile)
    const exitName = entityMap.get(chain.exitId)?.name || chain.exitName
    if (!exitName || !hasProxyOrGroup(config, exitName)) {
      throw `[${Plugin.name}] 链式代理出口不存在：${exitName || chain.exitId}`
    }
    item.proxy = exitName
    return
  }

  if (outboundMode === 'rule') {
    const rule = String(listener.rule || '').trim()
    if (!rule) throw `[${Plugin.name}] 子规则名称不能为空`
    item.rule = rule
  }
}

const applyAuth = (item, listener) => {
  const authMode = AUTH_MODES.includes(listener.authMode) ? listener.authMode : 'global'

  if (authMode === 'none') {
    item.users = []
    return
  }

  if (authMode === 'custom') {
    const users = buildUsers(listener)
    if (users.length === 0) throw `[${Plugin.name}] 独立认证至少需要填写一组用户名和密码`
    item.users = users
  }
}

const getCurrentGroupName = (profile, listener) => {
  const group = getProfileGroups(profile).find((item) => item.id === listener.groupId || item.name === listener.groupName)
  return group?.name || listener.groupName
}

const hasProxyOrGroup = (config, name) => {
  const names = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE'])
  for (const proxy of config.proxies || []) names.add(proxy.name)
  for (const group of config['proxy-groups'] || []) names.add(group.name)
  return names.has(name)
}

const buildUsers = (listener) => {
  return Object.entries(normalizeUsersInput(listener.users))
    .map(([username, password]) => ({
      username: String(username).trim(),
      password: String(password).trim()
    }))
    .filter((user) => user.username && user.password)
}

const normalizeUsersInput = (users) => {
  if (Array.isArray(users)) {
    return Object.fromEntries(users.map((user) => [user.username, user.password]).filter(([username]) => username))
  }

  if (!users || typeof users !== 'object') return {}

  return Object.fromEntries(
    Object.entries(users)
      .map(([username, password]) => [String(username).trim(), String(password)])
      .filter(([username]) => username)
  )
}

const parsePort = (value) => {
  const port = Number.parseInt(String(value).trim(), 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw '监听端口必须是 1-65535 之间的数字'
  return port
}

const normalizeListen = (value) => {
  const listen = String(value || DEFAULT_LISTEN).trim()
  return listen || DEFAULT_LISTEN
}

const nextAvailablePort = (listeners, reservedPorts = new Set()) => {
  const ports = new Set([...reservedPorts, ...listeners.map((listener) => Number(listener.port)).filter(Boolean)])
  let port = DEFAULT_PORT
  while (ports.has(port)) port += 1
  return port
}

const getUsedPorts = (config) => {
  const usedPorts = new Set()
  const add = (port) => {
    const value = Number(port)
    if (value) usedPorts.add(value)
  }
  add(config.port)
  add(config['socks-port'])
  add(config['mixed-port'])
  add(config['redir-port'])
  add(config['tproxy-port'])
  for (const listener of config.listeners || []) {
    if (String(listener.name || '').startsWith(LISTENER_PREFIX)) continue
    add(listener.port)
  }
  return usedPorts
}

const assertPortAvailable = (port, usedPorts) => {
  if (usedPorts.has(port)) {
    throw `[${Plugin.name}] 端口 ${port} 已被其他入站占用，请重新配置监听端口`
  }
}

const getListenerSummary = (listener, chains = []) => {
  const type = normalizeType(listener.type).toUpperCase()
  const chain = chains.find((item) => item.id === listener.chainId)
  const target =
    listener.outboundMode === 'proxy'
      ? listener.groupName || listener.groupId
      : listener.outboundMode === 'chain'
        ? chain?.name || listener.chainName || '链式代理'
        : listener.outboundMode === 'rule'
          ? listener.rule || '子规则'
          : '全局规则'
  const auth = { global: '继承全局认证', custom: '独立认证', none: '无认证' }[listener.authMode] || '继承全局认证'
  const udp = listener.type !== 'http' ? ` · UDP ${listener.udp === false ? '关闭' : '开启'}` : ''
  const status = listener.enabled === false ? '已禁用 · ' : ''
  return `${status}${type} ${normalizeListen(listener.listen)}:${listener.port || ''} -> ${target || '未设置'} · ${auth}${udp}`
}

const isDuplicatePort = (listeners, listener, index) => {
  const port = Number(listener.port)
  if (!port || listener.enabled === false) return false
  return listeners.some((item, itemIndex) => itemIndex !== index && item.enabled !== false && Number(item.port) === port)
}

const isUnsafeNoAuth = (listener) => {
  return listener.authMode === 'none' && ['0.0.0.0', '::', '[::]'].includes(normalizeListen(listener.listen))
}

const checkTcpPorts = async (ports) => {
  const os = Plugins.useEnvStore().env.os
  try {
    const output = await getTcpListenOutput(os)
    const occupied = parseTcpListenPorts(output, os)

    return ports.map((port) => ({
      port,
      occupied: occupied.has(port),
      detail: renderPortDetails(occupied.get(port))
    }))
  } catch (error) {
    return ports.map((port) => ({
      port,
      occupied: undefined,
      detail: error instanceof Error ? error.message : String(error)
    }))
  }
}

const getTcpListenOutput = async (os) => {
  if (os === 'windows') {
    return await Plugins.Exec(
      'powershell',
      ['-NoProfile', '-Command', 'Get-NetTCPConnection -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess | ConvertTo-Csv -NoTypeInformation'],
      { Convert: true }
    )
  }

  const lsof = await Plugins.ignoredError(Plugins.Exec, 'lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'])
  if (lsof) return lsof

  return await Plugins.Exec('ss', ['-H', '-ltnp'])
}

const parseTcpListenPorts = (output, os) => {
  return os === 'windows' ? parseWindowsTcpListenPorts(output) : parseUnixTcpListenPorts(output)
}

const parseWindowsTcpListenPorts = (output) => {
  const ports = new Map()

  for (const line of String(output || '').split('\n')) {
    const columns = parseCsvLine(line.trim())
    if (columns.length < 3 || columns[1] === 'LocalPort') continue

    const port = Number(columns[1])
    if (!port) continue
    pushPortDetail(ports, port, `${columns[0]}:${columns[1]} PID ${columns[2]}`)
  }

  return ports
}

const parseUnixTcpListenPorts = (output) => {
  const ports = new Map()

  for (const line of String(output || '').split('\n')) {
    const text = line.trim()
    if (!text || text.startsWith('COMMAND')) continue

    const port = extractPortFromListenLine(text)
    if (!port) continue
    pushPortDetail(ports, port, text)
  }

  return ports
}

const parseCsvLine = (line) => {
  return line
    .split(',')
    .map((value) => value.trim().replace(/^"|"$/g, ''))
    .filter((value) => value.length > 0)
}

const extractPortFromListenLine = (line) => {
  const matches = [...line.matchAll(/(?:^|\s)(?:TCP\s+)?(?:\*|\[[^\]]+\]|[0-9a-fA-F:.%]+):(\d{1,5})(?=\s|$|\))/g)].map((match) => Number(match[1]))
  return matches.find((port) => port > 0 && port <= 65535)
}

const pushPortDetail = (ports, port, detail) => {
  if (!ports.has(port)) ports.set(port, [])
  ports.get(port).push(detail)
}

const renderPortDetails = (details = []) => {
  return details
    .slice(0, 3)
    .map((line) => line.replace(/\s+/g, ' '))
    .join('<br>')
}

const renderPortCheckResults = (results) => {
  const lines = ['|端口|结果|详情|', '|-|-|-|']

  for (const result of results) {
    if (result.occupied === undefined) {
      lines.push(`|${result.port}|无法检查|${escapeTableCell(result.detail || '')}|`)
    } else if (result.occupied) {
      lines.push(`|${result.port}|可能已占用|${escapeTableCell(result.detail || '')}|`)
    } else {
      lines.push(`|${result.port}|未发现占用||`)
    }
  }

  lines.push('')
  lines.push('仅检查本机 TCP 监听端口；结果用于辅助判断，最终仍以核心启动结果为准。')
  return lines.join('\n')
}

const escapeTableCell = (value) => {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
}

const buildCurlCommand = (listener) => {
  const scheme = listener.type === 'socks' ? 'socks5h' : 'http'
  const auth = buildCurlAuth(listener)
  return `curl -x ${scheme}://${auth}${formatCurlHost(listener.listen)}:${parsePort(listener.port)} ${TEST_URL}`
}

const buildCurlAuth = (listener) => {
  if (listener.authMode !== 'custom') return ''

  const user = buildUsers(listener)[0]
  if (!user) return ''

  return `${encodeURIComponent(user.username)}:${encodeURIComponent(user.password)}@`
}

const formatCurlHost = (listen) => {
  const host = normalizeListen(listen)
  if (host === '0.0.0.0') return '127.0.0.1'
  if (host === '::' || host === '[::]') return '[::1]'
  if (host.includes(':') && !host.startsWith('[')) return `[${host}]`
  return host
}

const makeListenerName = (listener) => {
  const slug = String(listener.name || listener.type || 'listener')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  const id = String(listener.id || createId()).replace(/[^\w-]+/g, '')

  return `${LISTENER_PREFIX}${slug || 'listener'}-${id}`
}

const createId = () => {
  return (Plugins.sampleID ? Plugins.sampleID() : 'ID_' + Math.random().toString(36).slice(2, 10)).replace(/[^\w-]/g, '')
}

const readJsonFile = async (path) => {
  try {
    const content = await Plugins.ReadFile(path)
    return JSON.parse(content || '{}')
  } catch {
    return null
  }
}

const readSettings = async () => {
  return (await readJsonFile(CONFIG_FILE)) || {}
}

const writeSettings = async (settings) => {
  if (!(await Plugins.FileExists('data/third'))) await Plugins.MakeDir('data/third')
  if (!(await Plugins.FileExists(PATH))) await Plugins.MakeDir(PATH)
  await Plugins.WriteFile(CONFIG_FILE, JSON.stringify(settings, null, 2))
  await syncListenSummary(settings)
}

const formatListenAddresses = (settings) => {
  const profiles = Plugins.useProfilesStore().profiles || []
  const showName = profiles.length > 1
  const lines = []
  for (const profile of profiles) {
    const listeners = settings?.[profile.id]?.listeners || []
    for (const listener of listeners) {
      if (listener.enabled === false || !listener.port) continue
      const addr = `${normalizeListen(listener.listen)}:${listener.port}`
      lines.push(showName ? `${profile.name}  ${addr}` : addr)
    }
  }
  return lines.join(' / ')
}

const clonePluginMeta = (plugin) => JSON.parse(JSON.stringify(plugin))

const ensurePluginMetadata = async () => {
  const pluginsStore = Plugins.usePluginsStore()
  const plugin = pluginsStore.getPluginById(Plugin.id) || pluginsStore.getPluginById(STABLE_PLUGIN_ID)
  if (!plugin) return null

  const configuration = Array.isArray(plugin.configuration) ? plugin.configuration.map((item) => ({ ...item })) : []
  const index = configuration.findIndex((item) => item.key === LISTEN_SUMMARY_KEY)
  if (index === -1) {
    configuration.push({ ...LISTEN_SUMMARY_CONFIG })
  } else {
    configuration[index] = { ...configuration[index], ...LISTEN_SUMMARY_CONFIG, id: configuration[index].id || LISTEN_SUMMARY_CONFIG.id }
  }

  const nextId = String(plugin.id || '').startsWith('plugin-') ? STABLE_PLUGIN_ID : plugin.id
  const unchanged =
    nextId === plugin.id && JSON.stringify(plugin.configuration || []) === JSON.stringify(configuration)
  if (unchanged) return { ...plugin, id: nextId, configuration }

  const next = clonePluginMeta(plugin)
  next.id = nextId
  next.configuration = configuration
  await pluginsStore.editPlugin(plugin.id, next)
  return next
}

const syncListenSummary = async (settings) => {
  try {
    const plugin = await ensurePluginMetadata()
    const data = settings || (await readSettings())
    const addresses = formatListenAddresses(data)
    const appSettings = Plugins.useAppSettingsStore()
    const key = plugin?.id || STABLE_PLUGIN_ID
    const current = { ...(appSettings.app.pluginSettings[key] || {}) }
    if (String(current[LISTEN_SUMMARY_KEY] || '') === addresses) return
    current[LISTEN_SUMMARY_KEY] = addresses
    appSettings.app.pluginSettings[key] = current
  } catch (error) {
    console.warn(`[${Plugin.name}] 同步监听地址摘要失败`, error)
  }
}

const migrateLegacySettings = async (profile) => {
  const entityOptions = getEntityOptions(profile)
  const groups = getProfileGroups(profile)
  const listeners = []
  const chains = []

  const listenerSettings = await readJsonFile(LEGACY_LISTENER_FILE)
  const legacyListeners = listenerSettings?.[profile.id]
  if (legacyListeners) {
    const normalized = Array.isArray(legacyListeners.listeners) ? legacyListeners.listeners : normalizeProfileSetting(legacyListeners, profile).listeners
    listeners.push(...normalized)
  }

  const mapping = await readJsonFile(`${LEGACY_CHAIN_DIR}/${profile.id}.json`)
  if (mapping && typeof mapping === 'object') {
    const usedAsDialer = new Set(Object.values(mapping).filter(Boolean))
    for (const [exitId, dialerId] of Object.entries(mapping)) {
      if (!dialerId) continue
      // 只把链的起点（自己不是别人的前置）记成一条可绑定的链式配置
      if (usedAsDialer.has(exitId)) continue
      const hopIds = []
      let current = dialerId
      const seen = new Set([exitId])
      while (current && !seen.has(current)) {
        hopIds.push(current)
        seen.add(current)
        current = mapping[current]
      }
      if (hopIds.length === 0) continue
      chains.push(
        normalizeChain(
          {
            id: createId(),
            exitId,
            hopIds,
            name: autoChainName(exitId, hopIds, entityOptions)
          },
          entityOptions
        )
      )
    }
  }

  return {
    listeners: listeners.map((listener) => normalizeListener(listener, groups, [], chains)),
    chains
  }
}
