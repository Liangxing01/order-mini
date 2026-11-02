/**
 * 把 cloudfunctions 目录同步到小程序编译产物里，
 * 并给 project.config.json 补上 cloudfunctionRoot，方便在微信开发者工具里直接上传云函数。
 * 用法：node scripts/sync-cloud.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SOURCE = path.join(ROOT, 'cloudfunctions')
const TARGETS = ['dist/dev/mp-weixin', 'dist/build/mp-weixin']

function sync(target) {
  const root = path.join(ROOT, target)
  if (!fs.existsSync(root)) {
    console.log(`[skip] ${target} 不存在，先执行 npm run dev:mp-weixin`)
    return
  }

  const dest = path.join(root, 'cloudfunctions')
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(SOURCE, dest, { recursive: true })
  console.log(`[copy] cloudfunctions -> ${target}/cloudfunctions`)

  const projectConfigPath = path.join(root, 'project.config.json')
  if (fs.existsSync(projectConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(projectConfigPath, 'utf8'))
      config.cloudfunctionRoot = 'cloudfunctions/'
      fs.writeFileSync(projectConfigPath, JSON.stringify(config, null, 2))
      console.log(`[patch] ${target}/project.config.json -> cloudfunctionRoot`)
    } catch (err) {
      console.warn('[warn] 无法修改 project.config.json：', err.message)
    }
  }
}

if (!fs.existsSync(SOURCE)) {
  console.error('找不到 cloudfunctions 目录')
  process.exit(1)
}

TARGETS.forEach(sync)
