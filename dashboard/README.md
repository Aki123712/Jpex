# JEPX 区域价敏感度仪表盘

交互式前端：情景推演 · 区域价走势 · 气温相关散点 · 日内曲线。

数据文件：`public/data/jepx-model.json`（由仓库根目录 `data/` 流水线聚合后同步）。

## 本地运行

```bash
cd dashboard
npm install
npm run dev
# → http://localhost:8080
```

## 说明

- 与仓库根目录的 **v5 数据管线**（`data/` / `output/`）配合使用
- 前端默认读 `/data/jepx-model.json`
- 图表主题为深色；Tooltip 已用浅色字保证可读

非投资建议。数据来自 JEPX 公开 CSV + Open-Meteo。
