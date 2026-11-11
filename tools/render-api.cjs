const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'API명세서.md'), 'utf8');
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const inline = s => esc(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => /^[^:]+\.md$/.test(url) ? `<a href="${encodeURI(url)}">${label}</a>` : label);
const lines = source.split(/\r?\n/);
let output = '', nav = [], section = 0;
for(let i=0;i<lines.length;i++) {
  const line = lines[i];
  if(line.startsWith('```')) {
    const code=[];
    while(++i<lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
    output += `<pre><code>${esc(code.join('\n'))}</code></pre>`;
  } else if(line.startsWith('|')) {
    const rows=[];
    while(i<lines.length && lines[i].startsWith('|')) {
      const cells=lines[i].split('|').slice(1,-1).map(x=>x.trim());
      if(!cells.every(x=>/^:?-+:?$/.test(x))) rows.push(cells);
      i++;
    }
    i--;
    output += '<div class="table-wrap" tabindex="0" aria-label="API 표 가로 스크롤"><table><colgroup><col style="width:6%"><col style="width:39%"><col style="width:12%"><col style="width:43%"></colgroup><thead><tr>'+rows[0].map(c=>`<th scope="col">${inline(c)}</th>`).join('')+'</tr></thead><tbody>';
    output += rows.slice(1).map(row=>'<tr>'+row.map((cell,j)=> {
      let content=inline(cell);
      if(j===1) content=cell.split(/, (?=(?:GET|POST|PATCH|PUT|DELETE) )/).map(endpoint=> {
        const match=endpoint.match(/^(GET|POST|PATCH|PUT|DELETE) (.+)$/);
        return match?`<span class="endpoint"><span class="method ${match[1].toLowerCase()}">${match[1]}</span><code>${esc(match[2]).replace(/\//g,'/<wbr>')}</code></span>`:inline(endpoint);
      }).join('');
      return `<td>${content}</td>`;
    }).join('')+'</tr>').join('')+'</tbody></table></div>';
  } else if(line.startsWith('# ')) output+=`<h1>${inline(line.slice(2))}</h1>`;
  else if(line.startsWith('## ')) { const id='section-'+(++section); nav.push(`<a href="#${id}">${inline(line.slice(3))}</a>`); output+=`<h2 id="${id}">${inline(line.slice(3))}</h2>`; }
  else if(line.startsWith('- ')) output+=`<p class="bullet">${inline(line.slice(2))}</p>`;
  else if(line.trim()) output+=`<p>${inline(line)}</p>`;
}
const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>헬스장 앱 API 명세서</title><style>
:root{color-scheme:light;--ink:#172536;--muted:#526174;--line:#dce3ea;--blue:#174f8a}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f4f6f9;color:var(--ink);font-family:"Malgun Gothic",system-ui,sans-serif;font-size:16px;line-height:1.8}main{max-width:1480px;margin:32px auto;padding:40px 44px 70px;background:white;border:1px solid var(--line);border-radius:14px}h1{font-size:32px;line-height:1.4;margin:0 0 16px}h2{font-size:23px;margin:48px 0 18px;padding-top:16px;border-top:2px solid var(--line);scroll-margin-top:24px}p{margin:12px 0;overflow-wrap:anywhere}a{color:var(--blue)}nav{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0 32px}nav a{font-size:14px;text-decoration:none;background:#edf3f9;padding:7px 12px;border-radius:6px}.bullet{padding-left:18px;position:relative}.bullet:before{content:"•";position:absolute;left:0}.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:9px;margin:18px 0 24px}table{border-collapse:collapse;table-layout:fixed;width:100%;min-width:1000px;font-size:16px;line-height:1.65}th{text-align:left;background:#eaf0f7;color:#263d55;font-weight:700;padding:13px 14px;border-bottom:2px solid #ccd8e5}td{padding:15px 14px;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}tr:last-child td{border-bottom:0}tbody tr:nth-child(even){background:#f8fafc}tbody tr:hover{background:#eef5fc}td:first-child{white-space:nowrap;font-family:Consolas,monospace;color:var(--blue);padding-left:12px;padding-right:6px}td:nth-child(3){font-size:14px;color:#384e64;word-break:normal}code{font-family:Consolas,"Malgun Gothic",monospace;font-size:.94em;background:#eef2f6;padding:1px 4px;border-radius:3px}.endpoint{display:block;margin-bottom:9px}.endpoint:last-child{margin-bottom:0}.endpoint code{display:block;background:none;padding:3px 0 0;font-size:15px;line-height:1.65;overflow-wrap:anywhere}.method{display:inline-block;font-family:Consolas,monospace;font-size:12px;font-weight:bold;line-height:1.7;border-radius:4px;padding:1px 7px;background:#e7edf4;color:#304c69}.get{background:#e1f0ef;color:#145d53}.post{background:#e6edfc;color:#244d91}.patch,.put{background:#fff0d9;color:#775010}.delete{background:#fce6e6;color:#923535}pre{background:#172536;color:#edf2f8;padding:22px;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere}pre code{background:none;padding:0;color:inherit} @media(max-width:800px){main{margin:0;padding:24px 18px;border:0;border-radius:0}h1{font-size:27px}nav{gap:6px}h2{font-size:21px}}@media print{@page{size:A4 landscape;margin:12mm}body{background:white}main{margin:0;padding:0;border:0;max-width:none}nav{display:none}table{min-width:0;font-size:11px}.table-wrap{overflow:visible}td,th{padding:8px}td:nth-child(3){font-size:10px}.endpoint code{font-size:10px}h2{break-after:avoid}tr{break-inside:avoid}}
</style></head><body><main>${output.replace('</h1>','</h1><nav aria-label="문서 목차">'+nav.join('')+'</nav>')}</main></body></html>`;
fs.writeFileSync(path.join(root,'API명세서.html'),html,'utf8');
console.log(JSON.stringify({tables:(html.match(/<table>/g)||[]).length,rows:(html.match(/<tbody>/g)||[]).length,sections:section,output:'API명세서.html'}));
