# GitHub Pages 部署指南 - 3 步快速启用

由于权限限制，请按以下步骤手动启用 GitHub Pages。**只需 2 分钟！**

## 方法一：通过 GitHub Web UI（推荐 - 最简单）

### 第 1 步：打开仓库设置
1. 进入你的仓库：https://github.com/xuxuanhaoT2w/jifen
2. 点击顶部菜单栏的 **Settings**（设置）

### 第 2 步：找到 Pages 配置
1. 在左侧菜单中，下拉找到 **Pages** 选项
2. 点击进入 Pages 设置

### 第 3 步：启用 GitHub Pages
1. 在 "Source" 部分，选择 **Deploy from a branch**
2. 在分支选择下拉菜单中：
   - Branch: 选择 **main**
   - Folder: 选择 **/ (root)**
3. 点击 **Save** 按钮

### ✅ 完成！
稍等 1-2 分钟，你会看到：
```
✓ Your site is published at https://xuxuanhaoT2w.github.io/jifen/
```

---

## 方法二：自动部署工作流（高级）

如果想要每次 push 自动部署，按以下步骤操作：

### 第 1 步：创建工作流文件
在你的仓库根目录创建文件：
```
.github/workflows/deploy.yml
```

### 第 2 步：复制以下配置
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Setup Pages
        uses: actions/configure-pages@v4
      
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v3
```

### 第 3 步：上传文件
```bash
# 复制上面的内容到文件
mkdir -p .github/workflows
# 创建 deploy.yml 文件并粘贴内容

git add .github/workflows/deploy.yml
git commit -m "添加自动部署工作流"
git push origin main
```

### ✅ 完成！
每次 push 到 main 分支，自动部署到 GitHub Pages

---

## 部署后验证

### 方式 1：检查部署状态
1. 进入仓库主页
2. 点击右侧 "Deployments" 或 "Environments" 
3. 查看最新的部署记录

### 方式 2：访问网站
打开浏览器访问：
```
https://xuxuanhaoT2w.github.io/jifen/
```

### 方式 3：查看 Actions 日志
1. 进入 Settings → Pages
2. 查看 "Deployment history" 部分

---

## 🔗 部署完成后的访问地址

```
https://xuxuanhaoT2w.github.io/jifen/
```

📱 在任意设备打开这个链接，即可使用完整的多人协作记分板！

---

## 常见问题

**Q: 部署后打开是 404？**  
A: 等待 2-3 分钟，GitHub Pages 需要时间构建。刷新浏览器试试。

**Q: 修改代码后多久生效？**  
A: 通常 1-2 分钟自动部署。

**Q: 可以选择其他分支吗？**  
A: 可以，在 Pages 设置中改为其他分支即可。

**Q: 支持自定义域名吗？**  
A: 支持，在 Pages 设置中的 "Custom domain" 配置。

**Q: 能否为 root URL 部署？**  
A: 不能。GitHub Pages 用户站点需要 username.github.io 仓库。

---

## 🎯 下一步

部署完成后：

1. **复制分享链接**
   ```
   https://xuxuanhaoT2w.github.io/jifen/
   ```

2. **邀请队友加入**
   - 分享链接给队友
   - 队友打开链接自动加入房间

3. **开始游戏**
   - 选择玩家名字
   - 输入数据
   - 实时计分

---

## 📞 需要帮助？

如果部署有问题，请检查：

✅ 仓库是否为 public（GitHub Pages 需要公开仓库）  
✅ main 分支是否包含 index.html  
✅ Pages 设置中是否正确选择了分支  
✅ 防火墙是否阻止了 GitHub  

有其他问题欢迎提交 Issue！

---

**快速链接**
- 📖 [使用文档](README.md)
- 🔧 [后端集成](BACKEND.md)  
- 📊 [项目概览](README_FULL.md)
