/** Baizor AI login dictionaries. */

export const NS = 'baizorLogin'

/** Simplified Chinese Baizor login messages. */
export const zh = {
  'trigger': '白泽AI登录',
  'trigger.aria': '白泽AI登录（Baizor AI Login）',
  'panel.title': '白泽 AI 登录',
  'panel.close': '关闭',
  'panel.opened': '已在浏览器中打开白泽登录页。在那边完成授权后，API 密钥会被保存，默认模型也会自动设为白泽返回的 CLI 默认模型。',
  'panel.url.label': '登录页',
  'panel.copy': '复制链接',
  'panel.copied': '已复制',
  'panel.waiting': '等待浏览器授权……剩余 {seconds} 秒',
  'panel.done': '登录成功：API 密钥已保存，默认模型已切换为白泽返回的 CLI 默认模型。',
  'panel.failed': '登录失败：{message}',
  'panel.again': '重试',
} satisfies Record<string, string>

/** Translation keys owned by the Baizor login namespace. */
export type BaizorLoginKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Baizor AI login copy. */
    baizorLogin: BaizorLoginKey
  }
}

/** English Baizor login messages. */
export const en = {
  'trigger': 'Baizor AI Login',
  'trigger.aria': 'Baizor AI Login',
  'panel.title': 'Baizor AI Login',
  'panel.close': 'Close',
  'panel.opened': 'The Baizor sign-in page opened in your browser. Complete the authorization there; the API key is saved and the default model is set automatically.',
  'panel.url.label': 'Sign-in page',
  'panel.copy': 'Copy link',
  'panel.copied': 'Copied',
  'panel.waiting': 'Waiting for browser authorization… {seconds}s left',
  'panel.done': 'Signed in: the API key is saved and the default model is now the CLI default model returned by Baizor.',
  'panel.failed': 'Login failed: {message}',
  'panel.again': 'Try again',
} satisfies Record<BaizorLoginKey, string>
