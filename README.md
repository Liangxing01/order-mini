# 蓝宝宝专属小厨房

家庭点菜微信小程序。uni-app（Vue 3 + Vite）前端 + 微信云开发（云函数 + 云数据库 + 云存储）后端。

## 功能

- **点菜**：左侧分类栏 + 右侧双列菜品卡；搜索、日期/餐次选择、购物车、随机点菜、邀请下单；点「下单」即完成记账，不再有二次确认弹窗
- **周排菜**：点菜页「饮食计划」进入周视图（周一至周日 × 早餐/午餐/晚餐），按日期+餐次选菜、上移/下移调整、长按整餐挪到别的格子、格子内 🛒 一键加入购物车，数据以 `status: planned` 落 `order` 集合
- **上传菜品**：封面、名称、分类、品类、辣度、耗时、简介、食材清单、做法步骤（可配图）、更多图片
- **菜品管理**：搜索、批量选择、批量迁移分类、上下架、删除
- **分类管理**：新增/重命名/排序/删除（删除时菜品可迁移到目标分类）
- **热度排行**：周榜 / 月榜 / 总榜，算法 `下单×3 + 加购×1 + 浏览×0.2`
- **食记**：食记 / 排菜计划 双页签，点卡片进入订单详情（菜品明细、菜量、备注、再来一单/撤销/加入购物车），计划也可直接加入购物车；普通订单一律 `status: finished`，不再有待确认环节
- **厨房**：概览、分类分布、近 7 天最常点、最近添加、采购清单（按天数合并食材用量）
- **我**：资料编辑、家庭成员、邀请、初始化数据库
- **图片优化**：全站图片走 `cloud-image` 组件——默认 `lazy-load` 懒加载 + `imageView2/2/w/{宽度}` 缩略图 + 加载淡入，失败自动退回原图

## 目录结构

```
src/
  api/            cloud.js（wx.cloud 封装） + index.js（各云函数 API）
  components/     dish-card / empty-state / bottom-sheet / plan-week / cloud-image（easycom 自动注册）
  config/         云环境 envId、云函数名、餐次、辣度等常量
  pages/
    order/        点菜首页（tabBar）
    record/       食记（tabBar）+ detail 订单详情
    kitchen/      厨房（tabBar）
    mine/         我（tabBar）
    dish/         edit / detail / manage
    category/     manage
    rank/         热度排行
  static/         tabbar 图标、hero 插画、头像
  store/          pinia：user / menu / cart
  utils/          date.js / image.js / ui.js
cloudfunctions/   initdb / user / category / dish / order / rank / stats / file
scripts/          gen-tabbar-icons.js / optimize-images.js / sync-cloud.js
```

## 本地开发

```bash
npm install
npm run dev:mp-weixin      # 产物 dist/dev/mp-weixin
npm run build:mp-weixin    # 产物 dist/build/mp-weixin（自动同步 cloudfunctions）
npm run gen:icons          # 重新生成 tabBar 图标
```

## 部署步骤

### 1. 填 AppID

打开 `src/manifest.json`，把 `mp-weixin.appid` 改成自己的小程序 AppID（AppID 必须开通云开发）。

### 2. 开通云开发环境

微信开发者工具 → 顶部「云开发」→ 创建环境，记下 **环境 ID（envId）**。

- 只有一个环境：`src/config/index.js` 里 `CLOUD_ENV = ''` 保持不变（使用默认环境）
- 多个环境：把 envId 填进 `CLOUD_ENV`

### 3. 构建并导入

```bash
npm run build:mp-weixin
```

微信开发者工具 → 导入项目 → 目录选 **`dist/build/mp-weixin`**（开发调试用 `dist/dev/mp-weixin`）。

`scripts/sync-cloud.js` 已自动把 `cloudfunctions/` 复制到产物目录，并在 `project.config.json` 写入 `cloudfunctionRoot: "cloudfunctions/"`，导入后工具左侧会出现 `cloudfunctions` 目录。

### 4. 上传云函数

右键 `cloudfunctions` 下的每个目录 → **上传并部署：云端安装依赖**，共 8 个：

`initdb`、`user`、`category`、`dish`、`order`、`rank`、`stats`、`file`

> `cloudfunctions/initdb/config.json` 里已写 `{"timeout": 20}`，上传部署时会自动生效，无需手动改。若已被部署过且报超时，可在云开发控制台 → 云函数 → `initdb` → 配置 → 超时时间 改为 20 秒。

### 5. 初始化数据库

编译后在小程序里：**我 → 初始化数据库 → 开始**。

`initdb` 会创建集合 `dish`、`category`、`order`、`hot_log`、`user`，并在分类表为空时写入 7 个默认分类（主食🍚 / 荤🥩 / 素🥬 / 蛋🍳 / 汤🥣 / 喝🧋 / 空气炸锅🍟）。

### 6. 建索引（建议）

云开发控制台 → 数据库 → 对应集合 → 索引管理：

| 集合 | 字段 | 说明 |
| --- | --- | --- |
| dish | `categoryId` + `createTime` | 分类列表分页 |
| dish | `status` + `hot.score` | 热度总榜 |
| hot_log | `date` + `dishId` | 周榜/月榜聚合 |
| order | `date` + `createTime` | 食记列表 |
| hot_log | `createTime` | TTL 清理（可选，设 180 天过期） |

### 7. 数据库权限

5 个集合的权限全部设为 **「仅管理端可读写」**（自定义规则 `{"read": false, "write": false}`）。所有读写都经由云函数，云函数使用管理员权限，不受该限制。

云存储权限不用改（免费套餐也改不了安全规则）：如果是「仅创建者可读写」也没关系，图片链接走 `file` 云函数换取，云函数是管理端权限，家人和体验者照样能看到别人上传的图。

## 云函数约定

统一入参 `{ action, data }`，统一出参 `{ code, msg, data }`，`code !== 0` 视为失败。

| 云函数 | action |
| --- | --- |
| initdb | 无 action，直接调用 |
| user | `me` / `update` / `members` / `bind` / `removeMember` |
| category | `list` / `create` / `update` / `remove` / `sort` |
| dish | `list` / `detail` / `create` / `update` / `remove` / `removeBatch` / `batchMove` / `toggleStatus` / `track` |
| order | `submit` / `list` / `detail` / `cancel` / `finish` / `repeat` / `randomPick` / `planSave` / `planMove` / `planClear` |
| rank | `hot`（`range: week / month / all`） |
| stats | `overview` / `shoppingList` |
| file | `tempUrls`（批量把 `cloud://` fileID 换成 https 临时链接）—— 用管理端权限，绕开存储安全规则限制 |

云函数运行在 UTC 时区，日期统一用 `beijingDate()` 转成北京时间后再落库，避免「晚上 8 点后的单记到前一天」。

周排菜复用 `order` 集合：一个「日期 + 餐次」只保留一份 `status: 'planned'` 文档，`list` 支持 `statuses` 数组过滤；提交订单走原有 `submit`，计划本身不会自动删除。

## 备注

- 小程序主包限制 2MB，当前产物约 741KB；`hero-bg.png` 已压缩到 750×316（401KB），新增静态图请先压缩
- 菜品图统一用 `<cloud-image>`（`size` 取 `avatar/thumb/card/cover/full`，对应 160/200/240/480/750px 宽）。`cloud://` fileID 会先用 `getTempFileURL` 换成 https 临时链接（客户端拿不到时走 `file` 云函数），再在链接上拼 `?imageView2/2/w/{宽度}` 由云存储 CDN 实时出缩略图；缩略图拉取失败时组件会自动回退原图，并把环境标记为「不支持图片处理」，因此无需担心白屏
- `cloud-image` 默认懒加载，仅在页面 / `scroll-view` 滚动容器内生效；首屏头像等需要立即出现的图传 `:lazy="false"`
- 微信 WXSS 不支持本地图片作 `background-image`，页面里统一用 `<image>` 元素铺底
- 首个进入小程序的用户会被自动设为 `admin`，其余为 `member`；家人扫码或打开分享卡片进来即自动并入同一家庭（`familyId`），不需要邀请确认
