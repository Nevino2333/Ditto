/**
 * Ditto 运行时兼容 polyfill。
 *
 * 注入到每个第三方应用 iframe 的 HTML <head>，确保 Chrome 80+ 兼容：
 *  - flex gap（Chrome 84+ 才支持，旧版本直接忽略 → 布局塌陷）
 *  - inset 简写（Chrome 87+ 才支持，旧版本忽略 → 遮罩层定位失效）
 *  - aspect-ratio（Chrome 88+ 才支持，顺便补）
 *
 * 策略：feature detection，支持的浏览器直接跳过，零开销。
 * 不支持的浏览器在 DOM ready 后扫描并应用 margin / 显式属性等价方案。
 * 监听 MutationObserver 处理动态插入的节点。
 *
 * 注意：iframe 内的 HTML 不经过 Vite 构建，故无法依赖 shell 的
 * postcss-flex-gap-polyfill，必须运行时注入。
 */

/** polyfill 源码（IIFE 字符串，注入到 <head> 末尾） */
export const DITTO_RUNTIME_POLYFILL = `
<script>
(function(){
  var doc = document, win = window;
  function supports(prop, value){
    try { return win.CSS && CSS.supports && CSS.supports(prop, value || '0'); }
    catch(e){ return false; }
  }
  var gapOK = supports('gap', '1px');
  var insetOK = supports('inset', '0');
  var aspectOK = supports('aspect-ratio', '1');

  function parseLen(v){
    if(!v) return 0;
    var m = /(-?\\d*\\.?\\d+)px/.exec(v);
    return m ? parseFloat(m[1]) : 0;
  }

  function applyFlexGap(el){
    if(gapOK) return;
    var cs;
    try { cs = getComputedStyle(el); } catch(e){ return; }
    var disp = cs.display;
    if(disp !== 'flex' && disp !== 'inline-flex') return;
    var gap = cs.gap;
    if(!gap || gap === 'normal' || gap === '0px'){
      gap = cs.rowGap || cs.columnGap || '';
    }
    if(!gap || gap === 'normal' || gap === '0px') return;
    var gpx = parseLen(gap);
    if(gpx <= 0) return;
    var gapStr = gpx + 'px';
    var dir = cs.flexDirection;
    var isCol = (dir === 'column' || dir === 'column-reverse');
    var isRev = (dir === 'row-reverse' || dir === 'column-reverse');
    var kids = el.children;
    var n = kids.length;
    for(var i = 0; i < n; i++){
      var idx = isRev ? (n - 1 - i) : i;
      var child = kids[idx];
      if(!child || child.nodeType !== 1) continue;
      if(i === 0) continue;
      // 只在没有显式 margin 时才补，避免覆盖作者样式
      if(isCol){
        if(!child.style.marginTop) child.style.marginTop = gapStr;
      } else {
        if(!child.style.marginLeft) child.style.marginLeft = gapStr;
      }
    }
  }

  function applyInset(el){
    if(insetOK) return;
    var cs;
    try { cs = getComputedStyle(el); } catch(e){ return; }
    var inset = cs.getPropertyValue('inset');
    if(!inset || inset === 'auto' || inset === '') return;
    // 仅处理 inset:0 单值简写（最常见场景）
    var val = inset.trim();
    if(val === '0' || val === '0px'){
      if(!el.style.top) el.style.top = '0';
      if(!el.style.right) el.style.right = '0';
      if(!el.style.bottom) el.style.bottom = '0';
      if(!el.style.left) el.style.left = '0';
    } else {
      // 多值：top right bottom left
      var parts = val.split(/\\s+/);
      if(parts.length >= 1){
        if(!el.style.top) el.style.top = parts[0];
        if(!el.style.right) el.style.right = parts.length > 1 ? parts[1] : parts[0];
        if(!el.style.bottom) el.style.bottom = parts.length > 2 ? parts[2] : parts[0];
        if(!el.style.left) el.style.left = parts.length > 3 ? parts[3] : (parts.length > 1 ? parts[1] : parts[0]);
      }
    }
  }

  function applyAspect(el){
    if(aspectOK) return;
    var cs;
    try { cs = getComputedStyle(el); } catch(e){ return; }
    var ar = cs.getPropertyValue('aspect-ratio');
    if(!ar || ar === 'auto') return;
    var m = /([\\d.]+)\\s*\\/\\s*([\\d.]+)/.exec(ar);
    if(!m){
      m = /^([\\d.]+)$/.exec(ar);
      if(!m) return;
      m[2] = '1';
    }
    var w = parseFloat(m[1]), h = parseFloat(m[2]);
    if(!w || !h) return;
    // 已显式设置 width/height 则不覆盖
    if(el.style.width || el.style.height) return;
    var rect = el.getBoundingClientRect();
    if(rect.width){
      el.style.height = Math.round(rect.width * h / w) + 'px';
    }
  }

  function applyAll(root){
    if(gapOK && insetOK && aspectOK) return;
    var nodes = (root || doc).querySelectorAll('*');
    for(var i = 0; i < nodes.length; i++){
      var el = nodes[i];
      applyFlexGap(el);
      applyInset(el);
      applyAspect(el);
    }
  }

  function init(){
    applyAll(doc);
    if(win.MutationObserver){
      var mo = new MutationObserver(function(muts){
        for(var i = 0; i < muts.length; i++){
          var added = muts[i].addedNodes;
          for(var j = 0; j < added.length; j++){
            var node = added[j];
            if(node.nodeType === 1){
              applyAll(node);
              // 也重新扫描父级（flex 容器可能换了子节点）
              if(node.parentNode) applyFlexGap(node.parentNode);
            }
          }
        }
      });
      var root = doc.documentElement || doc.body;
      if(root) mo.observe(root, { childList: true, subtree: true });
    }
  }

  if(doc.readyState === 'loading'){
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
</script>
`;

/**
 * 将 polyfill 注入到 HTML 字符串的 <head> 末尾。
 * - 若 HTML 没有 <head>，则在 <html> 后或字符串开头插入。
 * - 注入位置：所有其他 <link>/<style> 之后，确保可以覆盖。
 */
export function injectPolyfill(html: string): string {
  if (!html || typeof html !== 'string') return html;
  // 已注入标记，避免重复注入
  if (html.includes('__ditto_polyfill_injected')) return html;
  const marker = '<!--__ditto_polyfill_injected-->';
  const polyfill = marker + DITTO_RUNTIME_POLYFILL;

  // 优先插入到 <head ...> 的闭合 > 之后
  const headOpen = /<head\b[^>]*>/i.exec(html);
  if (headOpen) {
    const idx = headOpen.index + headOpen[0].length;
    return html.slice(0, idx) + polyfill + html.slice(idx);
  }
  // 没有 head，但有 html
  const htmlOpen = /<html\b[^>]*>/i.exec(html);
  if (htmlOpen) {
    const idx = htmlOpen.index + htmlOpen[0].length;
    return html.slice(0, idx) + '<head>' + polyfill + '</head>' + html.slice(idx);
  }
  // 退化：直接前置
  return polyfill + html;
}
