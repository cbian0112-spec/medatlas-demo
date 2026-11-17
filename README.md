# MedAtlas 产品医学资料中心原型

面向 Medical Information 团队的产品医学资料网站前端原型。

## 在线预览

- 网站：https://cbian0112-spec.github.io/medatlas-demo/
- 源码：https://github.com/cbian0112-spec/medatlas-demo

当前仓库及 GitHub Pages 均为公开状态，请勿上传真实、敏感或仅限内部使用的医学资料。

## 本地查看

直接双击 `index.html`，使用 Microsoft Edge 或 Chrome 打开即可，无需安装依赖。

如需通过本地服务器查看：

```powershell
python -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 当前产品专区

- 百泽安
- 百悦泽
- 百悦达
- 百拓维
- 凯泽百
- 凯洛斯
- 倍利妥
- 普贝希
- 百赫安

## 页面结构

### 单屏主页

- 保留深色医学科技视觉
- 顶部菜单直接列出全部九个产品
- 点击产品名称进入对应产品页
- 全站医学资料搜索，快捷键为 `Ctrl + K`
- 不使用向下滚动的长页产品列表

### 产品页面

每个产品均有独立 URL，例如：

```text
https://cbian0112-spec.github.io/medatlas-demo/#product/baiyueze
```

产品页面默认显示：

- 最新研究进展
- 重点研究更新
- 研究动态时间线
- 进展统计概览

次级栏目包括：

- 产品概览
- 全部资料
- 临床文献
- 指南共识
- 医学材料
- 产品内关键词、年份和资料类型筛选

## 预览文件

- `preview.png`：单屏主页
- `product-detail-preview.png`：百悦泽研究进展页

## 内容说明

目前只有产品名称来自需求。研究进展、资料名称、数量、日期和其他产品信息均为演示内容，不代表正式医学信息。接入正式数据前，需要 Medical Information 团队确认产品元数据、内容来源、审核状态和发布日期。
