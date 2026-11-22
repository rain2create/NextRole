// Record actual NextRole UI with synthetic API responses. Never reads personal runtime data.
// Run against a local server: node scripts/capture-showcase.cjs
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const base = process.env.NEXTROLE_PREVIEW_URL || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Use a local preview server.');
const out = path.resolve('output/showcase');
const media = path.resolve('docs/media');
const at = '2026-11-20T02:00:00.000Z';
const statuses = ['interviewing', 'offer', 'applied', 'saved', 'applied', 'rejected'];
const companies = ['云杉科技', '晴空数据', '拾光智能', '青禾研究院', '星河实验室', '远山网络'];
const roles = ['算法工程师', '机器学习工程师', '数据分析师', '大模型应用工程师', '推荐算法工程师', '后端开发工程师'];
const records = Array.from({ length: 24 }, (_, i) => ({
  id: `demo-${i}`, company: `${companies[i % 6]}（示例）`, role: roles[i % 6], location: ['上海', '北京', '杭州'][i % 3],
  url: '', status: statuses[i % 6], source: 'manual', appliedAt: i % 6 === 3 ? '' : at,
  everApplied: i % 6 !== 3, everOffer: i % 6 === 1, resumeVersionId: '', runIds: [],
  interviewAt: i % 6 === 0 ? '2026-11-25T06:00:00.000Z' : '', interviewRound: '技术一面', interviewLocation: '线上',
  notes: '虚构展示数据，不代表真实公司、职位或投递。', revision: 1, archivedAt: null, createdAt: at, updatedAt: at, history: [],
}));
const resume = {
  name: '林予安（演示）', headline: '算法工程师 · 机器学习方向', summary: '这是一份用于界面展示的虚构简历。',
  contact: { email: 'demo@example.com', phone: '', location: '上海', linkedin: '', github: '', website: '' },
  skills: [{ category: '技术能力', items: ['Python', 'PyTorch', '机器学习'] }],
  experience: [], education: [], projects: [], certifications: [], achievements: [],
};

async function main() {
  await fs.mkdir(out, { recursive: true }); await fs.mkdir(media, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 820 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let json = {};
      if (url.pathname === '/api/profile') json = {
        profile: { resume, resumeText: resume.summary, originalResumeId: 'demo-resume', resumeDirection: 'general', preferences: {}, answers: [], updatedAt: at },
        versions: [{ id: 'demo-resume', kind: 'original', label: '示例简历 · 算法方向', fileName: 'demo.pdf', createdAt: at }], translationDrafts: [],
        ai: { configured: true, keyKind: 'application', issue: null, model: '演示模型', agentModel: '演示模型', webSearch: false },
      };
      else if (url.pathname === '/api/browser') json = { open: false, linkedin: false, manualOpen: false, manualPending: false };
      else if (url.pathname === '/api/applications') json = { applications: [] };
      else if (url.pathname === '/api/autopilot') json = { autopilot: null };
      else if (url.pathname === '/api/job-feedback') json = { feedback: [], savedJobs: [] };
      else if (url.pathname === '/api/jobs/feedback') json = { entries: [] };
      else if (url.pathname === '/api/tracking') {
        const subset = records.filter(r => (!url.searchParams.get('status') || r.status === url.searchParams.get('status')) && (r.company + r.role).includes(url.searchParams.get('q') || ''));
        const page = Number(url.searchParams.get('page') || 1);
        json = { records: subset.slice((page - 1) * 20, page * 20), total: subset.length, page, pages: Math.max(1, Math.ceil(subset.length / 20)), summary: { applied: 20, interviewing: 4, offers: 4 } };
      }
      else if (url.pathname === '/api/email') json = { jobs: [], versions: [], runs: [], configured: false };
      else return route.fulfill({ status: 404, json: { error: 'No showcase fixture for this endpoint.' } });
      await route.fulfill({ json });
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    async function ready(route) {
      await page.goto(base + route); await page.waitForLoadState('networkidle'); await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => {
        const label = document.createElement('div'); label.textContent = 'NextRole 界面演示 · 虚构样本';
        label.style.cssText = 'position:fixed;bottom:12px;right:18px;z-index:1000;padding:6px 12px;background:#fffffff0;border:1px solid #dce7e9;border-radius:20px;color:#4b6c75;font:12px sans-serif;pointer-events:none';
        document.body.append(label);
      });
    }
    let frame = 0;
    async function frames(count, update) {
      for (let i = 0; i < count; i++) {
        const start = Date.now(); if (update) await update(i);
        await page.screenshot({ path: path.join(out, `${String(frame++).padStart(4, '0')}.png`) });
        await page.waitForTimeout(Math.max(0, 100 - (Date.now() - start)));
      }
    }
    await ready('/app');
    await page.screenshot({ path: path.join(media, 'nextrole-workspace.png') });
    await fs.copyFile(path.join(media, 'nextrole-workspace.png'), path.resolve('public/nextrole-preview.png'));
    await frames(32, i => page.mouse.move(18, 260 + i * 8));
    await page.getByLabel('外观设置').click();
    await page.getByRole('radio', { name: /雾紫云朵/ }).check(); await page.keyboard.press('Escape');
    await frames(22);
    await page.getByLabel('外观设置').click();
    await page.getByRole('radio', { name: /薄荷轻柔/ }).check(); await page.keyboard.press('Escape');
    await ready('/app/tracking');
    await page.setViewportSize({ width: 1200, height: 1000 });
    await page.screenshot({ path: path.join(media, 'nextrole-tracking.png'), fullPage: true });
    await page.setViewportSize({ width: 1200, height: 820 });
    await page.evaluate(() => window.scrollTo(0, 170));
    await frames(42, async i => { if (i > 12 && i < 32) await page.getByRole('region', { name: '申请记录，可上下滚动' }).evaluate((el, amount) => { el.scrollTop = amount; }, (i - 12) * 18); });
    await ready('/app');
    await page.getByRole('button', { name: '连接 LinkedIn', exact: true }).click();
    await page.locator('#browser-login').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(media, 'nextrole-login.png') });
    await ready('/app');
    await page.getByRole('tab', { name: '自动投递', exact: true }).click();
    await page.locator('#autopilot').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(media, 'nextrole-autopilot.png') });
    if (errors.length) throw new Error(errors.join('\n'));
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '10', '-i', path.join(out, '%04d.png'), '-frames:v', String(frame), '-filter_complex', 'split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', '-loop', '0', path.join(media, 'nextrole-demo.gif')], { stdio: 'inherit' });
    console.log(`Recorded ${frame} frames with synthetic data; no model calls or applications.`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
