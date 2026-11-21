from pathlib import Path
from docx import Document
from docx.shared import Cm, Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.section import WD_SECTION
from docx.text.paragraph import Paragraph

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / '大语言模型部署入门指南.docx'
CAT = ROOT / 'assets' / 'kitty-app.png'
INK = '30332D'
MUTED = '74776E'
ACCENT = 'B97859'
CREAM = 'F7F2EC'
PALE = 'F2F2ED'
GREEN = 'E9F0E8'
BLUE = 'EAF0F5'
LILAC = 'EFEDF6'

doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21), Cm(29.7)
sec.top_margin = Cm(1.8)
sec.bottom_margin = Cm(1.8)
sec.left_margin = Cm(2.0)
sec.right_margin = Cm(2.0)

styles = doc.styles
normal = styles['Normal']
normal.font.name = 'Arial Unicode MS'
normal.font.size = Pt(10.3)
normal.font.color.rgb = RGBColor.from_string(INK)
normal.paragraph_format.space_after = Pt(5)
normal.paragraph_format.line_spacing = 1.14
normal._element.rPr.rFonts.set(qn('w:eastAsia'), 'Arial Unicode MS')
for name, size, color in [('Title', 30, INK), ('Heading 1', 19, INK), ('Heading 2', 13, ACCENT), ('Heading 3', 11, INK)]:
    s = styles[name]
    s.font.name = 'Arial Unicode MS'
    s.font.size = Pt(size)
    s.font.bold = name != 'Title'
    s.font.color.rgb = RGBColor.from_string(color)
    s._element.rPr.rFonts.set(qn('w:eastAsia'), 'Arial Unicode MS')
    s.paragraph_format.keep_with_next = True
    s.paragraph_format.space_before = Pt(11 if name != 'Title' else 0)
    s.paragraph_format.space_after = Pt(6)

def shade(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:fill'), fill)
    tc_pr.append(shd)

def set_cell_margins(cell, top=110, start=120, bottom=110, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    mar = OxmlElement('w:tcMar')
    for side, value in [('top', top), ('start', start), ('bottom', bottom), ('end', end)]:
        node = OxmlElement(f'w:{side}')
        node.set(qn('w:w'), str(value))
        node.set(qn('w:type'), 'dxa')
        mar.append(node)
    tc_pr.append(mar)

def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    repeat = OxmlElement('w:tblHeader')
    repeat.set(qn('w:val'), 'true')
    tr_pr.append(repeat)

def add_para(text='', style=None, bold_lead=None, color=None):
    p = doc.add_paragraph(style=style)
    if bold_lead and text.startswith(bold_lead):
        r = p.add_run(bold_lead)
        r.bold = True
        p.add_run(text[len(bold_lead):])
    else:
        p.add_run(text)
    if color:
        for r in p.runs:
            r.font.color.rgb = RGBColor.from_string(color)
    return p

def add_bullet(text, level=0):
    p = doc.add_paragraph(style='List Bullet' if level == 0 else 'List Bullet 2')
    p.paragraph_format.space_after = Pt(2)
    p.add_run(text)
    return p

def add_number(text):
    add_number.counter=getattr(add_number,'counter',0)+1
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    p.add_run(str(add_number.counter)+'. '+text)
    return p

def callout(label, text, fill=CREAM):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    shade(cell, fill)
    set_cell_margins(cell, 150, 180, 150, 180)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(label + '  ')
    r.bold = True
    r.font.color.rgb = RGBColor.from_string(ACCENT)
    p.add_run(text)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)

def flow(title, nodes, fills=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    r = p.add_run(title)
    r.bold = True
    r.font.color.rgb = RGBColor.from_string(ACCENT)
    table = doc.add_table(rows=1, cols=len(nodes) * 2 - 1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    fills = fills or [CREAM, PALE, BLUE, GREEN, LILAC]
    node_width=(16.4-(len(nodes)-1)*.45)/len(nodes)
    for i,column in enumerate(table.columns):
        column.width=Cm(node_width if i%2==0 else .45)
    for i, text in enumerate(nodes):
        cell = table.cell(0, i * 2)
        cell.width = Cm(node_width)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        shade(cell, fills[i % len(fills)])
        set_cell_margins(cell, 140, 100, 140, 100)
        par = cell.paragraphs[0]
        par.alignment = WD_ALIGN_PARAGRAPH.CENTER
        par.paragraph_format.space_after = Pt(0)
        run = par.add_run(text)
        run.bold = True
        run.font.size = Pt(9)
        if i < len(nodes) - 1:
            arrow = table.cell(0, i * 2 + 1)
            arrow.width = Cm(.45)
            par = arrow.paragraphs[0]
            par.alignment = WD_ALIGN_PARAGRAPH.CENTER
            par.paragraph_format.space_after = Pt(0)
            rr = par.add_run('→')
            rr.bold = True
            rr.font.color.rgb = RGBColor.from_string(ACCENT)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)

def table(headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.style = 'Table Grid'
    t.autofit = False
    if widths:
        for column,width in zip(t.columns,widths): column.width=Cm(width)
    for i, h in enumerate(headers):
        c = t.rows[0].cells[i]
        shade(c, 'E9E5DE')
        set_cell_margins(c)
        c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        c.paragraphs[0].paragraph_format.space_after = Pt(0)
        r = c.paragraphs[0].add_run(h)
        r.bold = True
        r.font.size = Pt(9)
        if widths: c.width = Cm(widths[i])
    set_repeat_table_header(t.rows[0])
    for ri, row in enumerate(rows):
        cells = t.add_row().cells
        for i, text in enumerate(row):
            c = cells[i]
            c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if ri % 2 == 1: shade(c, 'FAFAF8')
            set_cell_margins(c)
            c.paragraphs[0].paragraph_format.space_after = Pt(1)
            r = c.paragraphs[0].add_run(text)
            r.font.size = Pt(9)
            if widths: c.width = Cm(widths[i])
    return t

def h1(text): doc.add_heading(text, level=1)
def h2(text):
    add_number.counter=0
    doc.add_heading(text, level=2)

def hyperlink(paragraph, text, url):
    part = paragraph.part
    rid = part.relate_to(url, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', is_external=True)
    link = OxmlElement('w:hyperlink')
    link.set(qn('r:id'), rid)
    run = OxmlElement('w:r')
    rpr = OxmlElement('w:rPr')
    col = OxmlElement('w:color'); col.set(qn('w:val'), '567C8D'); rpr.append(col)
    under = OxmlElement('w:u'); under.set(qn('w:val'), 'single'); rpr.append(under)
    run.append(rpr)
    txt = OxmlElement('w:t'); txt.text = text; run.append(txt)
    link.append(run); paragraph._p.append(link)

# Cover
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(38)
p.add_run().add_picture(str(CAT), width=Inches(1.28))
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(15)
r = p.add_run('从 API 到本地模型')
r.font.name = 'Arial Unicode MS'; r.font.size = Pt(30); r.bold = True; r.font.color.rgb = RGBColor.from_string(INK)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run('大语言模型部署入门指南')
r.font.name = 'Arial Unicode MS'; r.font.size = Pt(20); r.font.color.rgb = RGBColor.from_string(ACCENT)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(10)
r = p.add_run('用清晰的图解理解模型、应用、运行环境与资料库')
r.font.size = Pt(11); r.font.color.rgb = RGBColor.from_string(MUTED)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(100)
r = p.add_run('面向第一次部署大模型的读者  ·  中文版  ·  2026 年 11 月')
r.font.size = Pt(9); r.font.color.rgb = RGBColor.from_string(MUTED)
doc.add_page_break()

h1('先弄清楚：你说的“本地大模型”是哪一种？')
add_para('“在本地部署”常被用来描述两种不同的事情：在自己的电脑上运行聊天应用，或在自己的电脑上实际运行模型。它们的界线是模型推理发生在哪里。')
table(['方式', '模型在哪里运行', '网络与数据流向', '适合什么情况'], [
    ['调用云端 API', '服务商的服务器', '应用把提示词发到服务商；模型算完后返回结果', '追求能力、免下载模型；可接受联网和按量计费'],
    ['本机推理', '自己的 Mac / PC', '模型权重下载到本机；推理可在本机完成', '离线、控制数据流、实验开放权重模型'],
    ['混合方案', '本机与云端都有', '敏感/简单任务本机处理，复杂任务调用云端', '按隐私、速度、成本灵活分流']
], [2.4, 3.0, 6.0, 5.0])
callout('结合你的应用', 'lyx 是安装在本机的桌面应用，但目前的模型是通过 OpenAI API 在云端运行。因此“应用在本机”不等于“模型在本机”。ChatGPT 订阅和 API 账户计费也分别管理。')
flow('一次云端 API 对话的路径', ['你输入问题', 'lyx 界面', '本机 Electron 主进程', 'OpenAI API', '模型逐段回复'])
flow('真正的本机推理路径', ['你输入问题', '桌面应用', '本机运行器', '本机模型权重', '本机生成回复'], [GREEN, PALE, BLUE, CREAM, LILAC])
h2('本指南怎么读')
add_bullet('第 1–3 章：模型推理需要什么，硬件和量化是什么意思。')
add_bullet('第 4–6 章：理解 Tauri、React、Node.js、Electron、Docker、Ollama 和资料库（RAG）。')
add_bullet('第 7–9 章：从选方案到安装、运行、评估、安全和维护的实用步骤。')
doc.add_page_break()

h1('1. 大语言模型是怎样回答问题的？')
add_para('可以先把模型想成一个经过训练的“续写器”。它把输入转换成 token（词元），根据上下文计算下一个 token 的概率，再逐个选出 token，直到形成一段回答。它不是每次都从数据库查出唯一正确答案，所以仍可能编造或误解。')
flow('推理时发生的事情', ['提示词与上下文', '切分为 token', '模型计算下一个 token', '重复生成', '解码为文字'])
h2('基础概念')
table(['概念', '通俗解释', '部署时为什么重要'], [
    ['模型权重', '训练后学到的数值参数，像模型的“长期记忆”', '决定模型文件大小，也决定模型能力的一部分'],
    ['推理（Inference）', '训练完成后，模型根据新问题生成结果', '部署主要是把推理服务运行起来；通常不需要重新训练'],
    ['Token（词元）', '模型处理文本的单位，可能是一整个词、词的一部分或标点', '上下文长度、输入/输出用量常按 token 计算'],
    ['上下文窗口', '模型一次能参考的 token 总范围', '窗口越大通常越耗内存；长聊天也可能需要截断或摘要'],
    ['量化（Quantization）', '用较低精度存储权重，减小体积和内存占用', '常能让模型在小设备运行；可能略微降低精度或质量'],
    ['温度（Temperature）', '控制采样随机程度的参数', '较低更稳定，较高更多样；不是模型“智商”按钮']
], [3.0, 6.7, 6.7])
h2('粗略估计权重占用')
callout('示例', '7B 表示约 70 亿参数。若用 4-bit 量化，纯权重的理论体积约为 7B × 4 ÷ 8 ≈ 3.5 GB（十进制）。实际运行还要加上量化元数据、推理缓存、上下文 KV cache 和应用缓冲区，所以实际内存会更大。', BLUE)
add_para('因此选型要看“模型大小 + 量化格式 + 上下文长度 + 运行器开销”，不能只看模型页面上的参数量。Mac 的 M 系列使用统一内存，CPU 和 GPU 会共同使用这块内存；你的 M4 具体能跑多大模型，还需要看“关于本机”里的统一内存容量。')
doc.add_page_break()

h1('2. 部署一套大模型，包含哪些部件？')
add_para('模型部署不是单独下载一个“GPT 文件”。完整系统通常有界面、应用逻辑、推理运行器、模型权重和数据存储几层。通过 API 时，推理运行器和权重在云端；本机部署时它们都在自己的电脑或服务器上。')
flow('桌面应用分层', ['桌面界面', '应用主进程 / 本地服务', '推理运行器或 API 客户端', '模型权重 / 云端模型'])
table(['部件', '职责', '常见例子'], [
    ['桌面界面', '接收提问、显示对话、模型状态和资料', 'HTML/CSS/JavaScript、React'],
    ['桌面容器 / 应用壳', '创建窗口、菜单、文件访问与打包', 'Electron、Tauri'],
    ['后端或主进程', '保管密钥、读写文件、请求模型、处理流式结果', 'Node.js、Rust 服务'],
    ['推理运行器', '加载权重、安排 CPU/GPU 计算、暴露 API', 'Ollama、llama.cpp、vLLM'],
    ['模型权重', '供推理引擎加载的参数文件', '开放权重模型及其量化版本'],
    ['知识库 / 数据层', '保存原始资料、切分结果、向量和来源信息', '文件夹、SQLite、向量索引']
], [3.1, 7.2, 6.1])
callout('桌面版与网页的区别', '直接打开 index.html 只能显示网页。Electron / Tauri 运行时还会提供受控的本机能力，比如安全存储 API Key、访问文件和把网络请求放在主进程里。因此同一个 HTML 在浏览器和桌面壳中的能力不同。')
h2('流式回复为什么更有即时感？')
add_para('非流式请求会等完整答案返回后才显示。流式请求则把模型生成的文本片段一边产生、一边送回界面：先显示“正在思考”，第一个文本片段到达后逐段追加。它主要改善等待体验，通常不代表模型本身算得更快。')
doc.add_page_break()

h1('3. 本机部署先看硬件')
table(['信息', '为什么要看', '在哪里查看 / 怎么判断'], [
    ['统一内存 / RAM', '模型权重、缓存和系统都要占内存', 'Mac：苹果菜单 → 关于本机；留出系统和其他应用空间'],
    ['芯片与 GPU', '影响每秒 token 数和可用推理后端', '记录芯片型号；Apple Silicon 可利用统一内存架构'],
    ['磁盘空间', '权重、缓存和不同量化版本会占空间', '给模型文件、更新和应用留足余量'],
    ['散热与功耗', '长时间生成可能持续占用芯片', '笔记本注意温度、风扇和电池消耗'],
    ['上下文长度', '对话越长，注意力缓存越大', '从较短上下文开始，按需求增加']
], [3.1, 6.6, 6.7])
h2('选模型时的顺序')
add_number('先选任务：中文聊天、代码、文档问答、多模态还是离线。')
add_number('再看许可证：开放权重不代表没有使用条款；商用和再分发需读许可证。')
add_number('查看模型卡：参数规模、推荐内存、上下文、支持语言和量化格式。')
add_number('从小模型和较轻量化开始实测：看速度、准确性、长对话稳定性，再决定是否升级。')
callout('注意', '“GPT / ChatGPT”通常指 OpenAI 的托管模型与产品。不能把 ChatGPT 网页订阅下载成权重文件放进 M4；如要真正本机推理，需选可下载并许可本地运行的开放权重模型。')
doc.add_page_break()

h1('4. 常见软件名称：它们分别做什么？')
table(['名称', '它是什么', '放进大模型应用时的角色'], [
    ['Tauri', '桌面应用框架：系统 WebView 显示前端，Rust 处理系统能力', '可用来做体积较小的桌面壳；可以搭配 React，也可以不用 React'],
    ['React', 'JavaScript 用户界面库，用组件组合和更新界面', '负责聊天列表、输入框、设置等 UI；它本身不运行大模型'],
    ['Node.js', '在浏览器之外运行 JavaScript 的环境', '可写本机服务或 Electron 主进程，处理网络、文件和流式请求'],
    ['Electron', '用 Chromium + Node.js 技术栈构建桌面应用的框架', 'lyx 目前使用的桌面壳；网页界面通过 preload 与受限主进程通信'],
    ['Docker', '把程序及运行依赖打成镜像，再以容器运行', '让服务器部署环境可复现；容器不是模型，也不会自动让模型更快'],
    ['Ollama', '帮助下载、管理和运行开放权重模型的工具', '个人本机试跑常见选择；模型由本机资源决定速度和可用规模'],
    ['API', '程序之间约定好的请求与响应接口', '应用把提示词发给托管服务，接收文本或流式事件'],
    ['RAG', '检索增强生成：先从你的资料中检索，再让模型据此回答', '适合“问自己的文档”；通常不用改动模型权重']
], [2.4, 6.4, 7.6])
h2('概念关系图')
flow('一种常见桌面组合', ['React（画界面）', 'Electron / Tauri（桌面窗口）', 'Node.js / Rust（本机逻辑）', 'Ollama（本机推理）', '开放权重模型'])
add_para('这只是组合示例，不是必须一起安装的“全家桶”。lyx 当前由原生 HTML、CSS、JavaScript + Electron 构成，没有使用 React、Tauri 或 Docker；以后可以在保持聊天逻辑的前提下替换界面或桌面壳。', bold_lead='这只是组合示例')
doc.add_page_break()

h1('5. Docker 容器到底是什么？')
add_para('把 Docker 想成“可重复启动的打包环境”：镜像像一份只读的应用模板；容器是这份模板启动后的进程实例。镜像可以带应用和系统依赖，但数据、模型权重、网络端口通常要另外配置。容器共享宿主系统的内核，不等于完整虚拟机。')
flow('Docker 的基本关系', ['Dockerfile（构建说明）', '构建出镜像', '启动容器', '映射端口 / 挂载数据', '访问服务'])
table(['名词', '简单比喻', '要点'], [
    ['Dockerfile', '食谱', '描述如何构建环境和安装程序'],
    ['镜像（Image）', '打包好的模板', '版本化、可分发；通常不保存运行时用户数据'],
    ['容器（Container）', '模板启动后的实例', '可停止、删除、重建；重要数据应放到卷或挂载目录'],
    ['Volume / Bind mount', '外接储物空间', '让模型、数据库或上传文件在容器重建后仍保留'],
    ['Port mapping', '把容器的门转接到本机', '例如把容器服务端口映射到本机端口供桌面应用连接']
], [3.1, 4.0, 9.3])
callout('Mac 上的实用建议', 'Docker 很适合在 Linux 服务器上复现服务环境、部署 Web API 或数据库。macOS 上 Docker Desktop 需要虚拟化 Linux 环境；若目标只是第一次在 M4 本机体验开放权重聊天，原生 Ollama 往往更直接。容器化本身不等于本地模型推理，也不保证自动启用 Apple GPU 加速。', BLUE)
h2('什么时候值得用 Docker？')
add_bullet('团队要共享一套相同的服务版本、依赖和启动方式。')
add_bullet('把模型 API、向量数据库、前端等多个服务用 Compose 组合起来。')
add_bullet('开发环境和服务器环境要尽量一致。')
add_bullet('若只在个人 Mac 上跑一个现成模型，先用原生桌面运行器，等有明确部署需求再引入 Docker。')
doc.add_page_break()

h1('6. “资料库”是什么？为什么能问自己的文件？')
add_para('资料库不是把文档“塞进模型训练”。常见做法是 RAG：导入文档后，系统切成小段并为每段建立检索索引；提问时先找出相关段落，把段落与问题一起交给模型，再生成带依据的回答。资料源更新时可重建索引，而不用重新训练模型。')
flow('RAG 文档问答流程', ['导入 PDF / 文档', '抽取文字并切块', '建立检索索引', '问题匹配相关片段', '模型结合片段回答'], [CREAM, PALE, BLUE, GREEN, LILAC])
table(['阶段', '系统做什么', '常见失败原因'], [
    ['导入', '解析 PDF、DOCX、网页等文件内容', '扫描件没有 OCR；表格、页眉或脚注解析不完整'],
    ['切块', '把长文拆成带有标题和来源信息的小段', '切太碎丢上下文，切太大难以精准查找'],
    ['索引', '将片段转换为可检索的表示并保存', '嵌入模型不合适或索引未随文件更新'],
    ['检索', '按问题查找最相关片段，可混合关键词与语义相似度', '问题表述不匹配、筛选条件太严或资料本身无答案'],
    ['生成', '让模型根据问题和检索片段作答，最好引用来源', '资料冲突、上下文太多，或模型没有遵循“无依据就说明”']
], [2.3, 7.2, 6.9])
h2('RAG 与微调有什么区别？')
table(['方法', '改变什么', '更适合'], [
    ['RAG / 资料库', '改变每次回答时提供的参考资料', '企业手册、个人笔记、会更新的知识、需要出处的问答'],
    ['微调（Fine-tuning）', '用训练样本调整模型参数或行为', '固定格式、语气、任务模式；需数据整理和评估'],
    ['重新训练基础模型', '从大量数据训练模型本身', '研究或大规模模型研发；成本与工程门槛最高']
], [3.0, 6.0, 7.4])
callout('lyx 0.1.5 当前状态', '资料库已支持导入文件或文件夹、保留目录层级、整组选取及引用预览。提取和关键词检索在本机完成，提问时最多发送 8 个相关片段给 OpenAI。当前没有向量检索或 OCR，文件夹是导入时的快照。具体文件结构、PDF 分享和维护步骤见《lyx 部署过程与维护手册》。')
doc.add_page_break()

h1('7. 一般部署大模型的完整步骤')
steps = [
('定义目标', '明确任务、语言、离线要求、使用人数、图片/语音等模态，以及资料库需求。'),
('盘点硬件与约束', '记录系统、内存/统一内存、磁盘、GPU、网络、预算、隐私和许可证要求。'),
('决定云端、本地或混合', '云端 API 易开始、模型能力选择多；本机推理可控制数据路径，但受内存、速度和模型许可限制。'),
('选择模型与运行器', '按任务、参数量、上下文、量化、许可证和硬件支持选模型；再选 Ollama、llama.cpp、vLLM 或托管 API。'),
('准备环境与权重', '安装官方运行器和驱动，下载可信来源的模型权重，核对校验信息与许可证。'),
('先跑最小对话', '使用少量测试问题检查模型能否加载、中文质量、首 token 延迟、每秒 token 和内存峰值。'),
('接入应用与密钥', 'UI 发送消息；主进程或本机后端调用推理 API；密钥只存安全存储，不放进网页源码。'),
('按需添加资料库', '抽取、切块、嵌入、索引、召回、提示生成；要求引用来源并评估检索质量。'),
('评估与维护', '准备一组真实问题、答案标准、错误样本；记录模型/量化版本，更新时复测并保留回退方案。'),
('打包与交付', '按系统打包、设置图标、权限和自动更新策略；公开分发时处理签名、公证和许可证声明。')
]
for name, desc in steps:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(name + '  ')
    r.bold = True
    r.font.color.rgb = RGBColor.from_string(ACCENT)
    p.add_run(desc)
h2('部署完成前的验收清单')
for text in [
    '新用户能按说明启动；缺失模型、无网络和 API 错误都有清楚提示。',
    '确认模型究竟在本机还是云端，用户知道问题和文件会发往哪里。',
    '长回答能流式显示；取消、重试、超时和关闭窗口行为明确。',
    '有一组符合实际用途的测试题，既测正确案例，也测模型不知道答案时的行为。',
    '模型权重、聊天历史、日志与密钥存放位置明确；有备份和删除办法。',
    '检查许可证、第三方模型条款、API 用量计费与应用签名要求。'
]: add_bullet('☐ ' + text)
doc.add_page_break()

h1('8. 给你的 M4 Mac 的实用路线')
add_para('你现在的目标有两个可选方向，取决于“我的大模型”是指使用 GPT 能力，还是要求模型权重真正在电脑上运算。M4 芯片是有用的本机推理硬件，但还要看统一内存容量才能判断模型尺寸。')
table(['路线', '你现在的 lyx', '若改成真正本机模型'], [
    ['模型', 'OpenAI API 提供的托管模型', '下载许可允许的开放权重模型'],
    ['运行位置', 'lyx 窗口和密钥在本机；推理在云端', '窗口、运行器、权重和推理都在本机'],
    ['主要依赖', '网络、API Key、API 账户额度', '模型文件、内存、磁盘、本机推理运行器'],
    ['建议下一步', '把应用打成 .app；验证流式回复与错误提示', '先查统一内存，然后安装 Ollama，下载小型模型实测']
], [2.8, 6.8, 6.8])
h2('你的桌面应用目前如何工作')
flow('lyx 的 API 版', ['lyx 界面', 'Electron 主进程', '本机安全存储读取 Key', 'OpenAI Responses API', '流式文本返回界面'])
add_para('如果将来想切换为本机模型，可以让 Electron 主进程调用 Ollama 的本机 HTTP API，保留现有对话界面；变化主要发生在模型接入层。也可以做一个模式选择器，让用户选择 API 或本机运行器。')
h2('打包为可以双击的 Mac 应用')
add_number('在项目目录执行 npm run build。')
add_number('在 dist 中找到 lyx 的 DMG 或 ZIP；打开 DMG，将应用拖进“应用程序”。')
add_number('首次打开 macOS 可能提示安全验证；只运行你自己构建或可信来源的版本，不要绕过不熟悉的软件警告。')
add_number('将来分发给别人时，使用 Apple Developer ID 对应用签名并做公证；图标由项目的 ICNS 资源提供。')
callout('模型资料库不是模型本身', '桌面窗口负责交互，推理运行器负责计算，模型权重提供能力，资料库提供外部知识。把这四个角色分开理解，选型和排错就会清晰很多。')
doc.add_page_break()

h1('9. 安全、成本与常见问题')
h2('密钥与数据')
add_bullet('API Key 是可以发起付费请求的凭证。不要贴进聊天、截图、源码、Git 仓库或浏览器前端。用本机安全存储保存；怀疑泄露就撤销并轮换。')
add_bullet('使用云端 API 时，提示词会发送到服务商。发送敏感文档前先确认适用的账户数据政策、保留设置和组织要求。')
add_bullet('真正本机推理可减少把提示词发送给模型服务商，但桌面应用仍可能联网更新或调用其他服务；应按实际请求路径确认。')
add_bullet('检查开放权重模型的许可证、可商用条件、再分发要求和内容政策。')
h2('新手常见误区')
table(['误区', '更准确的理解'], [
    ['“我的 ChatGPT Plus 就能下载 GPT。”', 'ChatGPT 订阅是 ChatGPT 产品服务；API 和可下载模型权重是不同交付方式。'],
    ['“电脑有 M4 就一定能跑很大的模型。”', '还要看统一内存、模型量化、上下文和运行器；芯片代际不能代替内存容量。'],
    ['“装了 Docker 就有模型了。”', 'Docker 提供可重复的运行环境；模型权重和推理引擎仍要另行选择。'],
    ['“RAG 会消除幻觉。”', 'RAG 提供可检索依据，但召回、文档解析和生成都可能出错，仍需展示引用并复核。'],
    ['“API Key 放在前端也没关系，因为桌面应用是私人的。”', '前端资源可能被检查或复制；密钥应由主进程读取并发出请求。']
], [6.5, 9.9])
h2('故障排查顺序')
add_number('先确认打开的是桌面 .app，而不是双击 index.html。')
add_number('看设置页是否显示 Key 已保存；确认 API 项目有可用额度且模型 ID 有权限。')
add_number('检查网络、代理、防火墙、模型名和 API 错误代码。')
add_number('本机推理则检查权重是否下载完成、运行器是否启动、内存是否够用。')
doc.add_page_break()

h1('术语小抄与进一步阅读')
table(['术语', '一行记忆'], [
    ['LLM / 大语言模型', '根据上下文预测 token 并逐步生成文字的模型。'],
    ['权重', '模型学到的参数文件；可下载权重不必然等同于完全开放许可证。'],
    ['推理', '用训练好的模型计算并生成答案。'],
    ['运行器 / Runtime', '负责加载模型、调度硬件并提供生成接口的软件。'],
    ['量化', '以较低数值精度存权重，常用来节省内存和加快推理。'],
    ['上下文窗口', '模型一次推理能参考的 token 容量。'],
    ['API', '软件之间发送请求和返回结果的约定。'],
    ['流式响应', '模型生成过程中分段返回文字，不必等完整回答。'],
    ['RAG', '先检索外部资料，再把相关片段交给模型回答。'],
    ['Embedding / 嵌入', '把文本映射成向量，用于语义相似度检索。'],
    ['镜像 / 容器', 'Docker 的可复用应用模板 / 基于模板运行的实例。'],
    ['Electron / Tauri', '把 Web 界面装进桌面窗口并接入系统能力的应用框架。']
], [3.6, 12.8])
h2('官方资料与论文')
sources = [
    ('OpenAI API：Responses API', 'https://platform.openai.com/docs/api-reference/responses'),
    ('OpenAI API：平台快速开始', 'https://platform.openai.com/docs/overview'),
    ('Tauri：架构说明', 'https://v2.tauri.app/concept/architecture/'),
    ('Tauri：前端框架配置', 'https://tauri.app/start/frontend/'),
    ('React：Quick Start', 'https://react.dev/learn'),
    ('Node.js：About Node.js', 'https://nodejs.org/en/about'),
    ('Docker：Get started with Docker containers', 'https://docs.docker.com/learn/paths/get-started-with-docker-containers/'),
    ('Ollama：macOS 下载与运行介绍', 'https://ollama.com/download/mac'),
    ('Lewis et al.（2020）：RAG 原始论文', 'https://arxiv.org/abs/2005.11401')
]
for title, url in sources:
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_after = Pt(2)
    hyperlink(p, title, url)
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(12)
r = p.add_run('阅读原则：')
r.bold = True
p.add_run('产品能力、模型名称、许可和价格会变化。开始正式部署前，回到官方文档核对当前版本与使用条款。')

# Apply an explicit East Asian font to every run. Word's font.name only writes
# the Latin font slots; LibreOffice otherwise falls back to a Latin-only face.
all_paragraphs = list(doc.paragraphs)
for tbl in doc.tables:
    for row in tbl.rows:
        for cell in row.cells:
            all_paragraphs.extend(cell.paragraphs)
for paragraph in all_paragraphs:
    for run in paragraph.runs:
        run.font.name = 'Arial Unicode MS'
        rpr = run._element.get_or_add_rPr()
        fonts = rpr.rFonts
        if fonts is None:
            fonts = OxmlElement('w:rFonts')
            rpr.insert(0, fonts)
        for slot in ('ascii', 'hAnsi', 'eastAsia', 'cs'):
            fonts.set(qn(f'w:{slot}'), 'Arial Unicode MS')
        fonts.set(qn('w:hint'), 'eastAsia')
        lang = rpr.find(qn('w:lang'))
        if lang is None:
            lang = OxmlElement('w:lang')
            rpr.append(lang)
        lang.set(qn('w:val'), 'en-US')
        lang.set(qn('w:eastAsia'), 'zh-CN')

# Attach chapter breaks to their next heading, avoiding a blank page when a
# standalone page-break paragraph itself overflows the preceding page.
for paragraph in list(doc.paragraphs):
    if paragraph._p.xpath('.//w:br[@w:type="page"]'):
        following=paragraph._p.getnext()
        if following is not None and following.tag==qn('w:p'):
            Paragraph(following,doc).paragraph_format.page_break_before=True
            paragraph._p.getparent().remove(paragraph._p)
doc.core_properties.title = '从 API 到本地模型：大语言模型部署入门指南'
doc.core_properties.subject = '大语言模型部署原理、桌面应用技术和 Docker / RAG 基础'
doc.core_properties.author = 'lyx'
doc.save(OUT)
print(OUT)
