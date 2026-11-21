"""Rebuild the Chinese project-specific deployment manual; never reads API keys."""
from pathlib import Path
import json
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
WORK = DOCS / '.build'
WORK.mkdir(exist_ok=True)
FONT = 'Arial Unicode MS'
FONT_FILE = '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
pkg = json.loads((ROOT / 'package.json').read_text())
lock = json.loads((ROOT / 'package-lock.json').read_text())
version = pkg['version']
electron_version = lock['packages']['node_modules/electron']['version']

(WORK / 'fonts.conf').write_text(f'''<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig><dir>/System/Library/Fonts/Supplemental</dir><dir>/System/Library/Fonts</dir><cachedir>{WORK / 'font-cache'}</cachedir></fontconfig>''')

def diagram(name, title, rows):
    width, height = 1500, 130 + len(rows) * 150
    im = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(im)
    font = ImageFont.truetype(FONT_FILE, 30)
    bold = ImageFont.truetype(FONT_FILE, 37)
    draw.text((38, 20), title, font=bold, fill='#202020')
    for row_index, nodes in enumerate(rows):
        y = 100 + 150 * row_index
        box_w = (1420 - (len(nodes)-1)*52) / len(nodes)
        for i, txt in enumerate(nodes):
            x = 40 + i * (box_w + 52)
            draw.rounded_rectangle((x, y, x+box_w, y+112), 14, fill=['#f5ede6','#e8eef4','#eaf0e7','#f1edf5'][i % 4], outline='#c6c8c8', width=2)
            bounds = draw.multiline_textbbox((0,0), txt, font=font, spacing=8, align='center')
            draw.multiline_text((x+(box_w-bounds[2])/2, y+(112-(bounds[3]-bounds[1]))/2-bounds[1]), txt, font=font, fill='#303030', spacing=8, align='center')
            if i < len(nodes)-1:
                ax = x + box_w + 10
                draw.line((ax, y+56, ax+31, y+56), fill='#7f878b', width=4)
                if name == 'architecture' and row_index == 1:
                    draw.polygon([(ax,y+56),(ax+10,y+48),(ax+10,y+64)], fill='#7f878b')
                else:
                    draw.polygon([(ax+31,y+56),(ax+21,y+48),(ax+21,y+64)], fill='#7f878b')
    out = WORK / f'{name}.png'
    im.save(out)
    return out

arch = diagram('architecture', '一次提问的去程和回程', [
    ['界面与交互\nindex.html + src', '安全桥接\npreload.cjs', '本机主进程\nmain.cjs', '云端模型\nOpenAI API'],
    ['界面逐段显示\n正在生成', 'IPC 传回片段\nrequestId 对应', '读取事件流\nSSE delta', '云端生成\n文字片段']
])
keyflow = diagram('key-storage', '点击保存后 密钥如何落到磁盘', [
    ['设置输入框\n临时接收密钥', 'preload 转发\nsettings:set-key', 'safeStorage\n系统密钥加密', 'openai-key.enc\n磁盘上的密文']
])
packflow = diagram('packaging', '源代码如何变成一个可双击的应用', [
    ['源码与透明 PNG\npackage.json', 'electron-builder\n读取打包配置', 'Electron 运行时\n与 app.asar', 'lyx.app\nDMG 与 ZIP']
])

doc = Document()
doc.settings.odd_and_even_pages_header_footer = False
section = doc.sections[0]
section.different_first_page_header_footer = False
section.page_width, section.page_height = Inches(8.5), Inches(11)
section.top_margin = section.bottom_margin = Inches(.7)
section.left_margin = section.right_margin = Inches(.75)
section.header_distance = section.footer_distance = Inches(.32)
for name, size in [('Normal',10.5),('Title',26),('Heading 1',19),('Heading 2',12.5),('Heading 3',11)]:
    style = doc.styles[name]
    style.font.name = FONT
    style.font.size = Pt(size)
    style.font.color.rgb = RGBColor(0,0,0)
    style._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), FONT)
    style.paragraph_format.space_after = Pt(6)
    style.paragraph_format.line_spacing = 1.12
    if name.startswith('Heading'):
        style.font.bold = True
        style.paragraph_format.space_before = Pt(12)
        style.paragraph_format.keep_with_next = True

header = section.header.paragraphs[0]
header.text = f'lyx  {version}    部署过程与维护手册'
header.runs[0].font.size = Pt(8)
footer = section.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
footer.add_run('2026 年 11 月 21 日    ·    ')
fld = OxmlElement('w:fldSimple'); fld.set(qn('w:instr'),'PAGE'); footer._p.append(fld)
for r in footer.runs: r.font.size = Pt(8)

def para(text, bold=False):
    p=doc.add_paragraph(text)
    if bold:
        for r in p.runs: r.bold=True
    return p
def h(text): doc.add_heading(text,2)
def page(number, title):
    p = doc.add_heading(f'{number:02d}  {title}',1)
    p.paragraph_format.page_break_before = True
def code(text, size=8.6):
    p=doc.add_paragraph()
    p.paragraph_format.space_before=Pt(4)
    p.paragraph_format.space_after=Pt(8)
    p.paragraph_format.line_spacing=1.04
    p.paragraph_format.left_indent=Inches(.12)
    r=p.add_run(text.strip('\n'))
    r.font.name='Menlo'; r.font.size=Pt(size)
    r._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),FONT)
    return p
def table(headers, rows, widths):
    t=doc.add_table(rows=1,cols=len(headers)); t.autofit=False
    t.alignment=WD_TABLE_ALIGNMENT.CENTER
    props=t._tbl.tblPr
    borders=OxmlElement('w:tblBorders')
    for edge in ['top','left','bottom','right','insideH','insideV']:
        e=OxmlElement('w:'+edge); e.set(qn('w:val'),'single');e.set(qn('w:sz'),'5');e.set(qn('w:color'),'D9D9D9');borders.append(e)
    props.append(borders)
    for i,w in enumerate(widths): t.columns[i].width=Inches(w)
    for ri,row in enumerate([headers]+rows):
        cells=t.rows[0].cells if ri==0 else t.add_row().cells
        for i,text in enumerate(row):
            c=cells[i];c.width=Inches(widths[i]);c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            tc=c._tc.get_or_add_tcPr()
            shd=OxmlElement('w:shd');shd.set(qn('w:fill'),'E5EDF3' if ri==0 else ('F7F9FA' if ri%2==0 else 'FFFFFF'));tc.append(shd)
            margins=OxmlElement('w:tcMar')
            for side in ['top','left','bottom','right']:
                e=OxmlElement('w:'+side);e.set(qn('w:w'),'100');e.set(qn('w:type'),'dxa');margins.append(e)
            tc.append(margins)
            p=c.paragraphs[0];p.paragraph_format.space_after=Pt(0);p.paragraph_format.line_spacing=1.1
            r=p.add_run(text);r.font.size=Pt(9.2);r.bold=ri==0
        trpr=t.rows[ri]._tr.get_or_add_trPr()
        no_split=OxmlElement('w:cantSplit');trpr.append(no_split)
    repeat=OxmlElement('w:tblHeader');t.rows[0]._tr.get_or_add_trPr().append(repeat)
    doc.add_paragraph().paragraph_format.space_after=Pt(0)
def picture(path): doc.add_picture(str(path),width=Inches(6.95))
def link(label,url):
    p=doc.add_paragraph()
    r=p.add_run(label+'\n');r.bold=True;r.font.size=Pt(9)
    rel=doc.part.relate_to(url,'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',is_external=True)
    hl=OxmlElement('w:hyperlink');hl.set(qn('r:id'),rel)
    run=OxmlElement('w:r');rp=OxmlElement('w:rPr');sz=OxmlElement('w:sz');sz.set(qn('w:val'),'17');rp.append(sz);run.append(rp)
    tx=OxmlElement('w:t');tx.text=url;run.append(tx);hl.append(run);p._p.append(hl)


doc.add_picture(str(ROOT/'assets/kitty-app.png'),width=Inches(1.15))
doc.add_paragraph('lyx 部署过程与维护手册',style='Title')
para(f'M4 Mac 桌面应用    版本 {version}    更新于 2026 年 11 月 21 日',bold=True)
para('本手册说明 lyx 的文件结构、前后端分工、API 配置、资料库检索和打包维护。你可以按章节找到要改的文件，也可以按照步骤重新生成可双击的 Mac 应用。文中的示例与截图使用测试资料，不包含真实密钥。')
para('lyx 是本地运行的桌面客户端，通过 OpenAI API 调用云端 GPT。聊天界面、历史、附件副本和资料库保存在 Mac 上，模型推理在云端进行。当前没有下载 GPT 模型权重，断网时可以管理本地记录和导出 PDF，但无法获得新的模型回复。')
h('本版完成的功能')
para('对话支持流式显示、图片与 PDF 附件、重命名和单独删除，空对话创建后也会显示。分享按钮生成完整对话 PDF；资料库保留文件夹和子目录，可整组选取。工具箱包含原有计划、待办、网址、汇率和双栏翻译。')
table(['你想了解什么','阅读位置'],[
 ['目录和各个文件的职责','01 项目文件 · 02 数据与架构'],
 ['从零搭建与 API 配置','03 环境与界面 · 04 桥接与请求'],
 ['提示词和资料库原理','05 提示词 · 06 导入 · 07 检索'],
 ['分享与对话管理怎样实现','08 PDF 与会话管理'],
 ['打包 更新 维护和额度问题','09 打包安装 · 10 维护 · 11 额度与密钥'],
 ['测试和故障排查','12 验证与排查 · 13 官方资料']
],[3.75,3.2])

page(1,'项目文件和目录')
para('源码根目录是 lyxLLM。下面列出手工维护的主要文件；node_modules、构建产物和测试截图按目录合并展示。目录结构对应 0.1.5，通用入门指南仍用于解释基础概念。')
code('''lyxLLM/
├── package.json / package-lock.json  版本 依赖 命令 打包配置
├── main.cjs                         窗口 IPC 网络及原生对话框
├── preload.cjs                      页面可调用的受控桌面接口
├── index.html                       聊天 资料库 设置和管理弹窗
├── README.md                        快速操作与版本说明
├── src/
│   ├── app.js                       对话 流式消息 附件 分享 删除
│   ├── workspace.js                 切换工作区和工具箱通信
│   ├── library.js                   文件夹目录树 选择 导入与引用
│   ├── prompt-settings.js           提示词设置交互
│   └── styles.css                   全部主界面布局和样式
├── lib/
│   ├── attachments.cjs              附件本机存储及 API 输入组装
│   ├── stream.cjs                   SSE 事件流读取与结束检查
│   ├── translation.cjs              翻译语言 输入校验和规则
│   ├── prompts.cjs                  提示词持久化和资料引用规则
│   ├── library.cjs                  扫描 去重 保存 分段及检索
│   ├── extract-worker.cjs           PDF DOCX 和文本解析线程
│   └── chat-export.cjs              对话 HTML 排版及 PDF 生成
├── toolbox/
│   ├── index.html                   工具箱及翻译双栏结构
│   ├── toolbox.js                   待办 计划 备份及桥接
│   ├── translation.js               翻译请求 流式显示 停止复制
│   └── 其他 CSS 与本地资源
├── assets/
│   ├── kitty-app.png                透明小猫图标
│   ├── kitty-app-original.png       原图备份
│   ├── kitty.icns                   Mac 图标
│   └── kitty.iconset/               各尺寸图标
├── scripts/                         构建图标与离线回归测试
├── docs/                            中文手册及生成脚本
├── .checks/0.1.5/                   测试 PDF 截图与验收材料
├── node_modules/                    按锁文件安装的依赖
└── dist/0.1.5/                     DMG ZIP 和 mac-arm64/lyx.app''',8.4)
para('原 random/index.html 的工具箱已复制到 toolbox，不会在运行时读取原文件。修改工具箱时应编辑本项目的 toolbox 目录。')

page(2,'本机数据和系统架构')
picture(arch)
para('前端使用原生 HTML、CSS、JavaScript。Electron 主进程充当本机后台，preload 只开放允许的功能，云端 OpenAI 负责模型计算。IPC 是进程间消息通信；SSE 是服务器逐段返回结果的事件流。')
table(['术语','在本项目中的作用'],[
 ['Electron','把 Chromium 界面与 Node.js 后台打包成 Mac 桌面程序。'],
 ['Node.js 和 npm','前者执行后台 JavaScript，后者安装依赖与运行构建命令。App 自带运行环境，日常不用终端。'],
 ['React 和 Tauri','都是可选技术。本项目没有 React 组件，没有 Tauri 或 Rust 后台。'],
 ['Docker','封装服务运行环境的容器工具。当前桌面客户端不需要 Docker；未来部署服务器时才可能使用。']
],[1.45,5.5])
code('''~/Library/Application Support/lyx-chat/
├── openai-key.enc                   OpenAI 密钥密文
├── live-rates-key.enc               可选的汇率密钥密文
├── assistant-settings.json          自定义提示词
├── attachments/                     聊天图片和 PDF 的副本
├── library-v1/documents/<UUID>/
│   ├── meta.json                    文件名 路径 内容哈希等
│   ├── text.json                    提取文字及 PDF 页码
│   └── source.<扩展名>              导入的原文件副本
├── Local Storage/leveldb/           聊天 历史选择 工具箱偏好等
└── 其他 Chromium 缓存与设置''',8.7)
para('~ 表示当前用户主目录。appId 固定为 com.lyx.chat，userData 固定为 lyx-chat，升级继续使用这些位置。密钥由 safeStorage 加密；聊天、资料文字和提示词没有另外加密。它们不属于源码目录，也不会被构建白名单打进安装包。')

page(3,'建立项目和前端界面')
h('第一步 选择运行方式')
para('已有 OpenAI API 时，可以先做本机客户端。本项目让 M4 运行界面、文件解析和检索，云端模型处理问题。真正的离线部署需要另选能下载权重的模型和推理服务，再适配接口；购买 ChatGPT 订阅不等于获得可在 Mac 上运行的模型文件。')
h('第二步 安装开发依赖')
para('进入项目目录，确认 Node.js 和 npm 可用，再按 package-lock.json 安装依赖。首次建立项目时使用 npm install，恢复已有工程时使用 npm ci。')
code('''cd /Users/lvyaxin/Desktop/random/lyxLLM
node --version
npm --version
npm ci
npm run dev''')
para(f'当前锁文件的 Electron 为 {electron_version}，electron-builder 为 25.1.8。生产依赖包括 PDF.js 4.10.38 和 Mammoth 1.13.0，用于本机读取 PDF 和 DOCX。依赖升级应单独验证，避免解析库与 Electron 内置 Node.js 不兼容。')
h('第三步 编写可视界面')
para('index.html 定义侧栏、聊天区、输入框、资料库、设置和弹窗。src/styles.css 控制布局、字体、颜色、等待动画和小窗口表现。src/app.js 维护对话状态并响应发送、重命名、删除和分享；workspace.js 切换聊天、工具箱和资料库。')
para('页面用 textContent 展示聊天和提取文字，避免把消息当成可以执行的 HTML。当前回复按纯文本显示，Markdown 标记会原样保留。图片通过受控附件接口获取预览；不会让消息任意读取磁盘文件。')
h('为什么直接打开 HTML 不行')
para('双击 index.html 只启动浏览器页面，不会执行 Electron 的 main.cjs 和 preload.cjs，因此没有 window.lyx 桌面桥接对象。页面可演示文字，但不能使用这套应用的密钥存储和原生文件功能。开发时运行 npm run dev，日常从应用程序或 Dock 打开 lyx.app。')

page(4,'主进程 桥接和 API 请求')
h('第四步 创建桌面窗口')
para('main.cjs 等待 Electron 就绪后创建 BrowserWindow，通过绝对路径加载 index.html。窗口启用 contextIsolation 和 sandbox，关闭 nodeIntegration。页面不能直接调用 Node.js 文件操作；preload.cjs 用 contextBridge 暴露指定方法。')
table(['界面调用','IPC 通道','主进程执行'],[
 ['hasApiKey / saveApiKey','settings:has-key / set-key','检查是否保存或写入加密密钥'],
 ['streamReply','openai:stream-reply','校验消息 检索资料 请求模型'],
 ['importLibrary','library:import','显示原生选择器 递归导入'],
 ['exportChatPDF','chat:export-pdf','显示保存窗口 本地生成 PDF'],
 ['translateText','translation:start','使用独立翻译规则请求模型']
],[2.0,2.3,2.65])
para('main.cjs 的 handle 包装器只接受主窗口自身页面的请求。工具箱 iframe 通过 workspace.js 的动作白名单转发；不直接取得 API Key。requestId 用于区分流式回复与进度事件，完成后移除对应监听器。')
h('第五步 保存密钥')
picture(keyflow)
para('在左下角设置粘贴 OpenAI API Key 并保存。preload 转发到 main.cjs，safeStorage 使用 macOS 提供的系统秘密加密后写入 openai-key.enc。Key 不写在源码或文档里；页面仅获知是否已保存，保存后输入框清空。')
h('第六步 组装请求并逐段显示')
doc.paragraphs[-1].paragraph_format.page_break_before=True
para('main.cjs 固定请求 https://api.openai.com/v1/responses。运行时读取密钥放入 Authorization，设置 model、input、instructions、stream:true、store:false。attachments.cjs 读取最近 30 条可用消息，每条文字最多 12,000 字符，并把附件组装成输入。')
code('''{
  model: safeModel,
  input: messagesWithAttachmentsAndLibraryContext,
  instructions: customPromptAndLibraryRules,
  stream: true,
  store: false
}''',9)
para('上述字段中的变量来自当前设置、消息和已检索的资料。主进程把密钥放在请求头 Authorization 中，使用 Bearer 认证。它不会把密钥当作聊天 input 发给模型；store:false 请求不保留可再次获取的 Response 对象，不等于对服务商所有处理与日志作出零保留承诺。')
picture(arch)
para('发送时先插入 pending 助手消息，立即显示“正在思考”。stream.cjs 读取 response.output_text.delta，通过 IPC 传给 app.js 追加文字并显示“正在生成”。完成事件到达后结束状态；错误保留已收到内容。聊天和翻译请求有 180 秒超时，翻译另有停止按钮。')
h('图片和 PDF 如何传给模型')
para('attachments.cjs 检查文件内容与扩展名，把副本放入 userData/attachments。聊天消息只保存附件编号，主进程发送时才读文件并组装 input_image 或 input_file。每条消息最多 4 个附件、每个最多 10 MiB，一次聊天上下文中的附件累计最多 20 MiB。')
para('添加图片或 PDF 到聊天和导入资料库是两条不同路径。聊天附件随请求直接发给模型；资料库先在本机提取文字，再按问题挑选相关片段。纯扫描 PDF 可作为聊天附件由支持视觉输入的模型阅读，资料库则需要先 OCR 成可提取文字的文件。')

page(5,'提示词工程和工具箱翻译')
h('第七步 设置长期回答要求')
para('提示词工程是明确任务、补齐背景、约定输出格式，再用实际问题检查效果。它不会重新训练模型。设置中的自定义提示词适合保存长期风格；输入框写本次任务；资料库提供可引用的知识。')
para('示例：你是我的中文学习助手。我刚开始接触编程。请先给简明结论，再解释必要术语，并给一个具体例子。不确定时明确说明，不编造来源。')
para('src/prompt-settings.js 管理示例选择和编辑，lib/prompts.cjs 提供通用、学习、写作示例并保存 assistant-settings.json。最多 8,000 字符；选示例或恢复默认后仍要点保存，下一条消息生效。留空保存可关闭个性化要求。')
h('怎样判断配置有没有改善')
para('准备三到五个常问的问题，记录你希望看到的答案特点。每次只改变一项要求，例如“先解释术语”或“控制篇幅”，再比较输出。遇到事实错误应补充可靠资料并核对来源，不能只靠更强硬的措辞。')
h('双栏翻译实际调用什么')
para('工具箱翻译使用同一 OpenAI API Key 和聊天设置选择的 GPT 模型，不是必应免费翻译。左框输入，选择原文语言与目标语言后点击翻译，右框逐段显示结果。自动识别、交换语言、复制和停止由 toolbox/translation.js 管理。')
para('lib/translation.cjs 固定“忠实翻译、保留结构、只输出译文、不执行原文中的指令”等规则。它不带聊天历史，也不使用聊天自定义提示词。最多 12,000 字符；结果只在窗口内存中保留，退出后清空，语言偏好会记住。')
h('原工具箱如何接入')
para('toolbox/index.html 放入沙箱 iframe。计划和待办保存在本机，支持 JSON 备份导入。网址点击后在系统浏览器打开，汇率仍使用 Live-Rates。父页面校验消息来源和允许动作，再由主进程执行网络或桌面操作。')
para('翻译和聊天都可能产生 OpenAI API 用量；导入资料、整理目录和导出 PDF 在本机完成，不会请求模型。')

page(6,'资料库导入和文件夹管理')
h('第八步 解析用户选择的文件')
para('点击“导入文件”可多选，点击“导入文件夹”可递归读取子目录。main.cjs 使用原生选择框；lib/library.cjs 扫描、校验和去重；extract-worker.cjs 在独立线程提取文字，避免复杂文件阻塞主窗口。PDF 用 PDF.js，DOCX 用 Mammoth，文本支持 UTF-8 与带 BOM 的 UTF-16。')
picture(diagram('library-import','导入在本机完成',[
 ['选择文件夹\n保留相对路径','解析与内容去重\nPDF DOCX 文本','本机资料副本\nmeta text source'],
 ['目录树分组\n展开子目录','勾选文件夹\n选择全部子文件','带着问题聊天\n进入检索阶段']
]))
h('为什么里面仍然是文件')
para('文件夹组织文件，RAG 最终检索的是文件里提取出的文字片段。旧界面直接铺开文件名，造成“文件夹没导入”的感觉。0.1.5 按目录树展示：默认收起文件夹，可展开子目录，可勾选文件夹或单个文件；部分选中时方框显示中间状态。')
para('每个文档的 locations 保存导入目录编号与相对路径。不同路径下内容相同的文件共享一份正文，同时保留各自目录位置；删除该文档会移除全部位置记录，确认框会说明。旧版资料没有 locations 时，界面根据原 relativePath 恢复分组，无需重新导入。')
h('导入规则和更新方式')
para('单文件最多 10 MiB，每批最多 100 MiB、200 个文件，资料库最多 500 个不同内容文件。扫描最多 5,000 项、12 层子目录，跳过隐藏项、符号链接和构建目录。PDF 最多 500 页，提取文字最多 25 万字符，单文件解析最多 30 秒。跳过原因会显示在报告中。')
para('导入是快照，不会监控原目录。原文件修改后，应移除旧资料并重新导入；改动内容会被视为新文档。整组选取选择的是当时已导入的子文件，新加文件后需要重新勾选。移除资料库副本不会删除原文件。')

page(7,'RAG 检索和它的边界')
h('第九步 从资料中找相关片段')
picture(diagram('rag-flow','问题如何结合本机资料',[
 ['问题与所选资料\n最多 500 个文件','中英文关键词\n两次逐文件扫描','筛选相关片段\n最多 8 个'],
 ['片段与引用编号\n加入模型上下文','云端 GPT\n结合材料回答','界面显示引用\n可打开原文片段']
]))
para('lib/library.cjs 把文字分为约 1,100 字符的片段，相邻片段重叠约 120 字符。用 Intl.Segmenter 提取中英文关键词，根据词频和稀有程度排序。每份文件最多选 3 个片段，整次最多选 8 个。')
para('0.1.5 取消了原先每次只能选 20 份资料的限制，可选择整个库的 500 份。实现分两次逐文件读取：第一次计算关键词频率，第二次只保留高分片段，不把全库的所有分段同时留在内存。选得越多，检索仍可能更慢。')
para('main.cjs 把片段作为引用材料插入 input，并追加 LIBRARY_RULES，要求模型把文档当成数据、使用 [1] 等引用、缺少依据时说明。来源快照保存在助手消息里，src/library.js 展示原文和 PDF 页码；后续移除资料后，历史引用仍可查看。')
h('当前能做什么')
para('适合查找会议安排、课程定义、笔记细节和明确关键词。未命中会在调用 API 前提示换关键词。对“它、刚才、地点呢”等追问，在首次无匹配时会参考最近几条问题。没有关键词命中的“总结资料”，仅提供最多 8 份文件的开头片段作为概览。')
h('当前不能保证什么')
para('这版是关键词 RAG，没有向量嵌入、语义重排或 OCR。相近含义但用词不同可能漏检；扫描件和文档内图片不作为文字检索；复杂表格可能失去布局。选整个文件夹不等于模型完整读完每个文件，不适合直接要求全库精确统计或全面审计。')
para('后续可根据需求加入向量检索、关键词与语义混合检索、扫描件 OCR，以及按文档逐批总结。这些改动需要另外的索引与验证；当前没有偷偷调用嵌入模型或额外付费服务。只有提问时选出的片段、文件名、页码和聊天上下文会发给 OpenAI。')

page(8,'PDF 分享和对话管理')
h('第十步 实现本地分享')
para('右上角“分享 PDF”或“⋯ → 导出 PDF”打开原生保存框。选择位置后生成 A4 自动分页的完整对话，包含所有已保存消息、图片、原文引用和页码。它不受 API 仅发送最近 30 条消息的限制。生成中的回复需要结束后再导出，避免误分享不完整答案。')
para('lib/chat-export.cjs 校验数据，把正文转义为静态 HTML，嵌入本机图片，再在没有 preload 的隐藏沙箱窗口中用 printToPDF 生成 PDF。页面禁用远程资源和脚本；完成后销毁窗口、删除临时文件，再把 PDF 保存到选定位置。')
para('PDF 聊天附件只显示名称，不会把其原文件的全部页面拼接进去；需要分享原附件时请另附文件。丢失图片会在 PDF 中标注。聊天正文里手工输入的内容会原样导出，设置中的 API Key 不会主动加入文档。')
para('没有部署公共网站，因此本版不生成可公开访问的聊天链接。导出的 PDF 是独立文件，删除本地对话不会删除已导出的 PDF，也不能撤回已发送给别人的副本。导出上限为 5,000 条消息、约 500 万字符的对话 JSON 和累计 100 MiB 图片，超过时提示拆分，不会静默截断。')
h('第十一步 管理对话')
para('顶部“⋯”和侧栏每条对话右侧的“⋯”都提供重命名、导出 PDF、删除。src/app.js 不再过滤空消息的对话，所以新建后立刻可见，也能立刻删除。删除前有确认框，最后一条删完后会自动保留一个空白对话供继续使用。')
para('删除先保存移除后的聊天数组，成功后才清理附件。仍被其他对话或输入框草稿使用的附件会保留。资料库、API 配置和工具箱不受单个对话删除影响。正在生成回复或导出中的那一条对话暂时不能删除。')
screenshot=ROOT/'.checks'/version/'chat-menu.png'
if screenshot.exists():
    h('对话菜单和文件夹界面')
    doc.paragraphs[-1].paragraph_format.page_break_before=True
    para('以下截图来自隔离测试。顶部和侧栏菜单执行同一组对话操作；资料库可展开子目录，并显示整组或部分选中的状态。')
    doc.add_picture(str(screenshot),width=Inches(5.4))
    para('图 1  对话菜单包含重命名、导出 PDF 和删除。')
    folder_screenshot=ROOT/'.checks'/version/'library.png'
    if folder_screenshot.exists():
        doc.add_picture(str(folder_screenshot),width=Inches(5.4))
        para('图 2  文件夹层级和逐文件预览；勾选文件夹即可选择其子文件。')

page(9,'打包 安装和更新')
h('第十二步 准备图标和版本')
para('透明小猫 PNG 位于 assets/kitty-app.png。scripts/build-icon.sh 用 sips 生成多尺寸图，再用 iconutil 生成 kitty.icns。仅更换图标时才需要重新执行该脚本。名称固定 lyx，appId 和用户数据目录保持不变。')
code('''# 仅修改图标时需要
zsh scripts/build-icon.sh
# 生成 Apple 芯片版 DMG 和 ZIP
npm run build''')
picture(packflow)
para(f'package.json 的版本为 {version}，输出目录为 dist/{version}。electron-builder 把 main、preload、index、src、lib、toolbox、图标和生产依赖放入应用；开发测试、文档、真实用户数据和真实密钥不在打包白名单中。PDF 解析所需的原生模块会放到 app.asar.unpacked。')
code(f'''dist/{version}/
├── lyx-{version}-arm64.dmg
├── lyx-{version}-arm64-mac.zip
├── *.blockmap
├── builder-debug.yml
└── mac-arm64/lyx.app/Contents/
    ├── MacOS/lyx
    ├── Info.plist
    ├── Resources/app.asar
    ├── Resources/app.asar.unpacked/
    └── Frameworks/''',8.8)
h('第十三步 替换安装的应用')
para(f'用 ⌘Q 退出旧版。打开 dist/{version}/lyx-{version}-arm64.dmg，把 lyx 拖入“应用程序”并选择替换，再从“应用程序”启动并固定到 Dock。DMG 和 ZIP 是同一应用的两种分发形式，只选一种。修改源码不会自动替换已安装的副本。')
para('本地构建未使用 Apple Developer ID 签名或公证；首次打开按 macOS 的系统提示确认。正常覆盖安装沿用原数据目录。若钥匙串访问变化导致 Key 未加载，重新保存有效 Key 即可，不要删除整个数据目录来修复。')

page(10,'维护流程和备份')
table(['改动','修改位置','要重新打包吗'],[
 ['更换密钥 切换现有模型','App 设置','不需要'],
 ['调整回答风格','设置中的自定义提示词','不需要'],
 ['导入 移除和选择资料','资料库界面','不需要'],
 ['修改主界面或对话行为','index.html 和 src','需要'],
 ['修改检索或文档解析','lib/library.cjs 和 extract-worker.cjs','需要'],
 ['修改导出 PDF 版式','lib/chat-export.cjs','需要'],
 ['修改服务商或 API 协议','main.cjs lib/stream.cjs 等','需要'],
 ['升级依赖 图标或版本','package.json 锁文件 assets','需要']
],[2.0,3.8,1.15])
h('每次源码修改后的步骤')
code('''npm ci
npm run dev
node scripts/check-app.cjs
node scripts/check-library.cjs
# 有 Playwright 环境时执行桌面回归
node scripts/check-desktop.cjs
node scripts/check-library-desktop.cjs
npm run build
# 构建后验证 app.asar 内的实际代码和依赖
node scripts/check-library-desktop.cjs --packaged''',8.8)
para('测试需可用的 Playwright，可通过 LYX_PLAYWRIGHT_PATH 指向安装位置。版本更新时同时修改 package.json 和 package-lock.json，并调整 build.directories.output。不要手改 .app 内部的 app.asar。')
h('备份哪些内容')
para('源码备份保留配置、锁文件、src、lib、toolbox、assets、scripts、docs。node_modules 和 dist 可重建。用户数据备份应先完全退出 App，再复制 ~/Library/Application Support/lyx-chat 到自己的受控备份位置。只导出聊天 PDF 不能恢复可编辑聊天、资料库或设置。')
para('迁移到另一台 Mac 时，密钥密文未必可被新电脑解密，通常需要重新输入 Key。维护依赖时先备份，按版本说明逐项升级，再测试窗口、桥接、文件解析、流式请求和 PDF 导出。不要用 npm audit fix --force 直接跳过兼容性验证。')

page(11,'额度用完和更换 API')
para('API Key 用于认证，额度属于对应的 OpenAI API 组织。ChatGPT 订阅和 API 分别计费，不能仅凭订阅状态判断 API 余额；在同一个组织创建新 Key 不会自动增加余额。[1]')
h('余额不足时')
para('1. 登录 OpenAI 平台，核对当前组织与 Key 所属项目，打开 Billing overview。需要有该组织的付款管理权限。')
para('2. 在页面选择 Buy credits 或 Add to credit balance，首次设置可能是 Add payment details。核对购买金额及是否启用自动充值，再自行确认付款。具体可选金额、税费和限制以登录后的页面为准。[2]')
para('3. 购买完成后等待几分钟查看余额，再回到 lyx 发送简单问题。有效的原 Key 通常继续可用。若仍失败，检查错误代码；速率限制、模型权限和密钥无效不是同一种问题。[2][3]')
table(['错误类型','应检查的内容'],[
 ['余额不足 或 credit_balance_exhausted','所属组织余额以及付款状态'],
 ['rate_limit_exceeded','请求频率和 token 速率 降低频率后重试'],
 ['401 或 invalid_api_key','密钥是否完整 撤销或过期权限'],
 ['model_not_found 或权限错误','模型名称以及当前项目访问权限']
],[3.1,3.85])
h('更换 OpenAI Key')
para('在平台选中正确项目，创建拥有所需调用权限的新 Key；打开 lyx 设置，粘贴到 API Key 输入框并保存。用该项目可访问的模型验证一次后，按需要撤销旧 Key。不需要重装，也不需要把 Key 写进源码。[3]')
para('换另一个 OpenAI 项目的 Key 后，使用的是新项目的权限和计费归属，原组织余额不会随密钥迁移。App 不提供自动充值或余额查询；查看 Usage 与 Billing 应去官方平台。')
h('换其他服务商')
para('当前地址固定为 OpenAI Responses API。其他厂商的 Key 不能直接替换后就保证工作。需要按对方协议修改 main.cjs 的地址、认证、模型输入，必要时改 attachments.cjs、stream.cjs 和 translation.cjs，再更新前端模型列表、测试和重新打包。')

page(12,'验证结果和故障排查')
para('本项目的自动测试使用临时用户目录、模拟密钥和模拟 API 流，不消耗真实 API 额度，也不购买额度。它们验证应用行为，不证明真实账户余额、网络或模型回答质量。')
table(['测试文件','主要验证内容'],[
 ['check-app.cjs','安全桥接 密钥存储 SSE 附件与翻译输入'],
 ['check-library.cjs','真实 PDF DOCX 提取 目录和重复位置 24 文件检索'],
 ['check-desktop.cjs','真实窗口中的聊天 附件 翻译和工具箱'],
 ['check-library-desktop.cjs','文件夹选择 预览 RAG 引用 提示词持久化'],
 ['check-chat-desktop.cjs','由上项调用 检查空对话删除 重命名 PDF 与共享附件'],
 ['--packaged 模式','从构建的 app.asar 加载源码和依赖重复关键操作']
],[2.6,4.35])
h('常见现象')
table(['现象','处理'],[
 ['直接打开 HTML 后不能配置 API','从应用程序打开 lyx 开发时用 npm run dev'],
 ['空白对话不能分享','先有消息再导出 回复生成时需等待结束'],
 ['看见文件夹但没有展开文件','点文件夹旁箭头 子目录也可以分别展开'],
 ['文件导入被跳过','看导入报告 检查格式 大小 文字层与权限'],
 ['资料明明有但回答说没找到','本版关键词检索 试文档原词或缩小范围'],
 ['资料内容改了但回答仍旧','导入为快照 移除旧版后重新导入再选择'],
 ['PDF 图片提示丢失','原本机附件副本不存在 需重新添加图片'],
 ['接口报错或一直等待','检查完整错误 网络和模型权限 180 秒后会超时']
],[2.85,4.1])
para('聊天历史仍保存在 localStorage，空间不足会提示；导出 PDF 是分享文件，不是完整恢复备份。当前没有公开分享网站、自动更新服务器、聊天停止按钮、云同步或向量检索。以后增加这些能力时，应同步维护文档与测试。')

page(13,'官方资料和文档重建')
para('本手册的实现说明依据 0.1.5 源码。计费和项目管理相关官方说明于 2026 年 11 月 21 日核对；登录页面和服务规则可能继续变化，实际操作以账户状态为准。')
for label,url in [
 ('[1] ChatGPT 和 API 的计费归属','https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform'),
 ('[2] 预付费设置与充值','https://help.openai.com/en/articles/8264644-setting-up-and-managing-prepaid-api-billing'),
 ('[3] API 项目 密钥和权限管理','https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform'),
 ('API 余额与付款入口','https://platform.openai.com/settings/organization/billing/overview'),
 ('API 密钥管理入口','https://platform.openai.com/api-keys'),
 ('API 使用量入口','https://platform.openai.com/usage'),
 ('Electron 的 PDF 打印接口','https://www.electronjs.org/docs/latest/api/web-contents#contentsprinttopdfoptions'),
 ('Electron safeStorage','https://www.electronjs.org/docs/latest/api/safe-storage'),
 ('electron-builder 的 macOS 配置','https://www.electron.build/mac.html')
]: link(label,url)
h('怎样更新这份手册')
para('正文、目录和示意图由 docs/build_deployment.py 生成；通用基础概念由 docs/build_guide.py 维护。修改功能后同步修改生成脚本，再运行 Python 构建手册，使用文档渲染工具生成逐页图片，检查中文字体、表格、图片和分页。')
code('python3 docs/build_deployment.py')
para('文档脚本使用 python-docx 和 Pillow，字体采用 Mac 上的 Arial Unicode MS。docs/.build 保存字体配置、示意图和渲染检查结果，不参与应用打包。README.md 提供更短的使用说明，技术细节以本手册与实际源码为准。')

# Use explicit East Asian fonts in every run, including table cells and headers.
for tree in [doc.styles.element, doc.element]:
    for border in list(tree.iter(qn('w:pBdr'))):
        border.getparent().remove(border)
for run in doc.element.iter(qn('w:r')):
    rp=run.find(qn('w:rPr'))
    if rp is None: rp=OxmlElement('w:rPr'); run.insert(0,rp)
    fonts=rp.find(qn('w:rFonts'))
    if fonts is None: fonts=OxmlElement('w:rFonts');rp.append(fonts)
    fonts.set(qn('w:eastAsia'),FONT)
    fonts.set(qn('w:hint'),'eastAsia')
doc.core_properties.title='lyx 部署过程与维护手册'
doc.core_properties.subject='M4 Mac 上的 Electron 桌面客户端部署与维护'
doc.core_properties.author='lyx'
out=DOCS/'lyx部署过程与维护手册.docx'
doc.save(out)
print(out)
