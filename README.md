# Perch

> 桌面宠物 × 计划提醒。一只住在桌面上的小家伙，按你预设的计划提醒你该做什么。

**Perch** 是一个基于 Electron 的 Windows 桌面宠物应用。桌宠常驻桌面，在计划该做的时候从头顶弹出气泡提醒你，可以打勾完成、写日历便签、用 JSON 批量导入计划，还能随时更换皮肤。

---

## 关于本项目与 Bongo Cat

**本桌宠的呈现形式与皮肤体系基于 [Bongo Cat](https://github.com/MMmmmoko/Bongo-Cat-Mver)（Bongo Cat Mver）** —— 感谢原作者让"桌面宠物"这件事变得这么可爱。

- **Bongo Cat 软件作者**：[@MMmmmoko_想要画得好看-](https://space.bilibili.com/150353599)
- 本项目是**独立的计划提醒工具**，与 Bongo Cat 原作者无隶属关系，也没有复用其程序代码；复用的是社区皮肤资源与"桌上猫"这一表现形式

### 内置皮肤与版权

| 皮肤 | 作者 | 授权 |
| --- | --- | --- |
| 洛茜（内置） | 皮肤作者 **优恩Moral**，软件作者 @MMmmmoko_想要画得好看- | 仅限**个人自用 / 非盈利直播**，**禁止二次售卖** |

> ⚠️ 内置皮肤为第三方免费分享资源，版权归原作者所有。请勿用于商业用途或二次售卖。若你是原作者并希望撤下，请提 Issue，我会立即移除。
>
> 仓库中**不包含**其他第三方皮肤（守岸人 / 爱弥斯 / 达妮娅等），那些皮肤仅在本地保存用于个人测试。想用其他皮肤请自行获取并按下文「资源包构成」导入。

## 快速开始

```bash
npm install        # 国内网络请先设置镜像: set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm start          # 开发模式运行
npm run dist       # 打包安装程序 + 便携版（输出到 dist/）
```

> `npm run pack:preset` 用于从本地 `模型/` 文件夹重新生成内置皮肤包；仓库不含 `模型/`，从零克隆时不需要执行该命令（内置皮肤已在 `assets/packs/`）。

## 功能一览

| 功能 | 说明 |
| --- | --- |
| 三种计划模式 | **每日重复** / **每周重复**（weekdays 0-6，0=周日）/ **单次**（指定日期，即日历便签） |
| 时间段 | 每条计划可带 `start`–`end`（HH:MM），两者都留空 = 全天任务 |
| 气泡提醒 | 空闲时常驻显示"进行中 + 全天 + **已过时间未打勾**"的计划；到点新计划开始时气泡弹跳 + 猫切换表情 |
| 关闭气泡 | 气泡右上角有 ×（鼠标移上去才显示），关闭后不再打扰；**有新的计划开始时自动重新弹出** |
| 打勾 | 气泡和面板里点 ✓ 完成任务，当天不再显示；每日/每周计划次日/下周自动重新出现 |
| 空闲随机提醒 | 完全空闲时按随机间隔提醒（默认 30~60 分钟，内置"多喝水/起来走走"等），文案与间隔可在设置里自定义 |
| 点击猫猫 | 弹出管理面板（定位到"今日计划"）；右键猫猫 = 菜单（今日计划/管理面板/置顶/退出） |
| 日历便签 | 月历视图，点任意日期查看/写入当天的便签与单次计划，日期上有圆点标记 |
| JSON 导入导出 | 支持合规范 JSON 文件导入（校验报错、合并/替换两种策略）、面板内编辑、导出文件 |
| 资源包换肤 | 支持导入文件夹或 zip；兼容 Bongo Cat Mver 皮肤目录自动转换 |
| 皮肤自定义 | 外观页可调该皮肤的全部装饰/表情开关（初值取自模型真实默认值，跨度大的参数自动用滑块）；实时生效、按皮肤保存；水印项已剔除 |
| 托盘 | 托盘图标菜单：今日计划 / 管理面板 / 开机自启 / 退出；关闭面板只是隐藏 |
| 皮肤校准 | 位置微调（X/Y 偏移）+ 缩放修正 + 水平翻转，按皮肤保存；皮肤自带 config 的校准值以「建议值」按钮提供，默认不自动套用（该系数配合原软件窗口尺寸，套用可能过大） |
| 其他 | 窗口置顶开关、开机自启、猫猫缩放、位置记忆、猫爪空闲动画（可关闭）、换分辨率后位置自动校正 |

## 性能与兼容模式

设置页有一个 **「兼容模式（关闭硬件加速）」** 开关，直接影响 CPU 占用（实测，同一皮肤）：

| 模式 | CPU 占用（单核） | 说明 |
| --- | --- | --- |
| 兼容模式 开启（默认） | 约 18% | 用 CPU 软件渲染，最稳定（规避部分机器显卡驱动/第三方软件注入导致的白底、闪屏） |
| 兼容模式 关闭 | 约 0.6% | 用显卡硬件渲染，CPU 占用极低 |

> 若你觉得桌宠耗电/发热，可在设置里关闭兼容模式（需重启应用生效）。若关闭后出现**白色背景或闪屏**，请重新开启它。

其他已内置的省电优化：窗口隐藏/拖动时暂停渲染、拖动时动画静止、计划状态无变化时不重复刷新、空闲动画单定时器、外观页只为当前皮肤创建渲染器。


---

## 计划 JSON 格式

在面板「JSON 导入导出」页可直接编辑后点"应用到应用"，也可保存为 `.json` 文件后"从文件导入"。

```json
{
  "version": 1,
  "daily": [
    { "title": "早读", "start": "08:00", "end": "08:40", "note": "" }
  ],
  "weekly": [
    { "title": "周会", "weekdays": [1], "start": "10:00", "end": "11:00", "note": "" }
  ],
  "once": [
    { "title": "交材料", "date": "2026-09-20", "start": "", "end": "", "note": "记得带合同" }
  ]
}
```

字段规则：

- 顶层三个数组均可省略；`version` 固定为 1
- `title` 必填（≤100 字）；`note` 可选（≤500 字）
- `start` / `end` 格式 `HH:MM`；**要么都填，要么都留空（留空 = 全天任务）**，结束必须晚于开始（不支持跨天）
- `weekly.weekdays`：0-6 的数组，**0=周日、1=周一 … 6=周六**，可多选如 `[1,3,5]`
- `once.date`：`YYYY-MM-DD`
- 导入策略：**合并**（追加新计划）或 **替换**（清空现有全部计划后导入）；校验失败会列出所有错误且不写入

数据文件位置（托盘 → 设置 → 打开数据文件夹）：`%APPDATA%\Perch\`
- `plans.json` 计划数据
- `state.json` 勾选状态（按 日期 记录，每天自动重新开始）
- `settings.json` 应用设置（含按皮肤保存的自定义参数与位置微调）
- `packs\` 已安装的皮肤资源包

---

## 资源包构成（换肤规范）

资源包分两类：**Live2D 包**（渲染 Live2D 模型，带物理与呼吸动画）和 **分层 PNG 包**（图层叠加）。导入时按 `manifest.json` 的 `type` 字段区分。

### Live2D 包（type: "live2d"）

```
我的Live2D皮肤/
├── manifest.json
└── cat_model/               Live2D Cubism 3/4 模型目录
    ├── cat.model3.json      （Moc/Textures/Physics/Groups 等）
    ├── cat.moc3
    ├── cat.physics3.json
    ├── cat.cdi3.json
    └── cat.4096/texture_00.png
```

manifest 额外字段：

```json
{
  "format": 1,
  "type": "live2d",
  "name": "洛茜",
  "canvas": { "width": 612, "height": 354 },
  "model": "cat_model/cat.model3.json",
  "fit": { "scale": 1.05, "offsetX": 0, "offsetY": 0 },
  "params": {
    "handLeftDown": "CatParamLeftHandDown",
    "handRightDown": "CatParamRightHandDown"
  },
  "remindParams": { "ParamEyeLSmile": 1, "ParamMouthOpen": 0.7 },
  "idle": { "minInterval": 2500, "maxInterval": 6000, "pressMs": 260 }
}
```

- `model` 指向 model3.json；模型加载后自动等比缩放到底部对齐画布，`fit` 可微调
- `params.handLeftDown / handRightDown` 是"爪子按下"的参数 ID（空闲动画与提醒时按下用），不填则无爪子动画
- `remindParams` 是提醒瞬间的参数覆盖（如眯眼张嘴），8 秒后自动还原
- 眨眼（EyeBlink 组）与头发等物理由模型自身驱动；渲染层**不会每帧改写模型参数**（部分皮肤的开关参数与部件遮罩绑定，外部每帧赋值会导致部件消失/闪烁）
- 装饰开关（猫耳等）在导入时自动置开，水印参数自动置隐藏；其余可调项见「外观 → 自定义人物」

### 分层 PNG 包（默认，无 type 字段）

```
我的皮肤/
├── manifest.json            必需，见下
└── img/
    ├── cat.png              必需：猫身体（画布尺寸决定整体大小，如 612x354）
    ├── bg.png               可选：背景/桌面层（在最底下）
    ├── face/
    │   ├── 0.png            可选：表情覆盖层（叠加在脸上）
    │   └── 1.png
    ├── lefthand/
    │   ├── up.png           可选：左手"抬起"状态
    │   └── 0.png, 1.png…    可选：左手"按下"帧（空闲时随机播放）
    └── righthand/           可选：右手，同上
```

`manifest.json`：

```json
{
  "format": 1,
  "name": "我的皮肤",
  "author": "作者名",
  "version": "1.0.0",
  "canvas": { "width": 612, "height": 354 },
  "bg": "img/bg.png",
  "body": "img/cat.png",
  "faces": [
    { "file": "img/face/0.png", "name": "默认" },
    { "file": "img/face/1.png", "name": "开心" }
  ],
  "defaultFace": 0,
  "remindFace": 1,
  "handLeft":  { "up": "img/lefthand/up.png", "down": ["img/lefthand/0.png"] },
  "handRight": { "up": "img/righthand/up.png", "down": ["img/righthand/0.png"] },
  "idle": { "minInterval": 2500, "maxInterval": 6000, "pressMs": 240 }
}
```

要点：

- 只有 `body` 必填，其余图层缺失时自动省略
- `canvas` 必须与图层 PNG 的实际像素尺寸一致
- `faces[i].file` 中 `defaultFace` 是平时显示的表情，`remindFace` 是计划开始时的提醒表情
- `idle` 控制空闲爪子动画的节奏（毫秒）
- **兼容 Bongo Cat Mver 皮肤**：直接选择 Mver 皮肤文件夹（含 `img/keyboard` 或 `img/standard` 结构）导入即可自动转换；zip 也可以。`standard` 风格的手帧是双手合绘图，转换时只保留身体图层

导入方式：面板 →「外观」→ 导入资源包（选文件夹或 zip）。

内置包：

- `luoxi` —— **洛茜**（默认皮肤，Live2D）

> 分层 PNG 包的渲染同样支持（导入社区皮肤时若只有 PNG 图层会自动走这条路径），但仓库内置皮肤为 Live2D 格式。

---

## 目录结构

```
src/
├── main/            主进程
│   ├── index.js     入口：窗口/托盘/IPC/petpack 协议
│   ├── windows.js   桌宠窗（透明置顶拖拽）+ 管理面板窗
│   ├── scheduler.js 每分钟结算"当前时间段计划"→ 气泡
│   ├── plans.js     计划 CRUD / 按日解析 / 勾选 / JSON 导入导出
│   ├── packs.js     资源包校验 / 安装（文件夹/zip/Mver 识别）
│   ├── store.js     JSON 原子写入
│   └── tray.js      托盘
├── preload.js       contextBridge API
├── shared/schema.js 计划校验（主/渲染共用）
└── renderer/
    ├── pet/         桌宠页：图层合成 + 空闲动画 + 气泡
    └── panel/       管理面板：今日/日历/管理/JSON/外观/设置
assets/
├── icon.png         应用图标（scripts/build-icon.js 生成）
└── packs/luoxi/     内置洛茜资源包（scripts/build-preset-pack.js 生成）
scripts/             资源包转换 / 图标生成 / 贴图工具脚本
                      · build-preset-pack.js  从本地皮肤源生成内置包
                      · build-icon.js         生成应用图标
                      · find/erase-watermark.js  定位并擦除贴图上的水印
                      · scan-watermark.js     检查已装皮肤是否残留水印
模型/                （不入仓库）本地皮肤源文件夹，仅用于生成内置包
```

## 已知说明

- **兼容模式**（设置页可开关，默认开启）会关闭硬件加速，规避部分机器上第三方软件注入导致的 GPU 崩溃与白底；关闭它 CPU 占用会大幅下降，详见上文「性能与兼容模式」
- 渲染进程异常退出会自动重载（连续两次崩溃才重载，避免打断输入）
- 开发模式下"开机自启"注册的是 electron.exe；打包安装后注册的才是应用本体，请打包后使用该功能
- 多显示器/换分辨率后若桌宠落在屏幕外，启动时会自动回到默认位置
- 勾选记录只保留最近 120 天，自动清理
