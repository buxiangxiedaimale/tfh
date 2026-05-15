# FlowTodo 推送到 GitHub（PowerShell）
# 用法: .\scripts\push-to-github.ps1 -RepoUrl "https://github.com/你的用户名/flowtodo.git"

param(
    [Parameter(Mandatory = $true)]
    [string]$RepoUrl
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root
Write-Host "项目目录: $Root" -ForegroundColor Cyan

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "未安装 Git，请先安装: https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path ".git")) {
    git init
    git branch -M main
}

if ((Test-Path ".env.local") -and (git ls-files ".env.local" 2>$null)) {
    Write-Host "从 Git 索引移除 .env.local（含密钥，勿上传）" -ForegroundColor Yellow
    git rm --cached .env.local 2>$null
}

git add -A
if (git status --porcelain) {
    git commit -m "feat: FlowTodo 待办应用（Next.js + 同步 + 小记 + 热榜）"
} else {
    Write-Host "没有新的更改需要提交。" -ForegroundColor Yellow
}

if ((git remote) -contains "origin") {
    git remote set-url origin $RepoUrl
} else {
    git remote add origin $RepoUrl
}

Write-Host "正在推送..." -ForegroundColor Cyan
git push -u origin main
Write-Host "完成: $RepoUrl" -ForegroundColor Green
