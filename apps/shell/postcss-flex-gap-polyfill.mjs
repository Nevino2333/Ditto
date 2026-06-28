// PostCSS 插件：为 Chrome < 84 的 flexbox gap 提供 margin 回退
// Chrome 84+ 支持 flex gap，旧版本通过 > * + * margin 模拟
// 标准格式：返回带 postcssPlugin 与 hook 的对象
export default function flexGapPolyfill() {
  return {
    postcssPlugin: 'postcss-flex-gap-polyfill',
    Rule(rule) {
      let hasFlex = false;
      let flexDirection = 'row';
      let gapValue = null;

      rule.walkDecls((decl) => {
        if (decl.prop === 'display' && (decl.value === 'flex' || decl.value === 'inline-flex')) {
          hasFlex = true;
        }
        if (decl.prop === 'flex-direction') {
          flexDirection = decl.value;
        }
        if (decl.prop === 'gap') {
          gapValue = decl.value;
        }
      });

      if (hasFlex && gapValue) {
        const isColumn = flexDirection.indexOf('column') !== -1;
        const marginProp = isColumn ? 'margin-top' : 'margin-left';

        // 创建回退规则：> * + * 选择器，加 margin
        const fallbackSelector = rule.selector + ' > * + *';
        const fallbackRule = rule.cloneAfter({ selector: fallbackSelector });
        fallbackRule.walkDecls((decl) => decl.remove());
        fallbackRule.append({ prop: marginProp, value: gapValue });
      }
    },
  };
}
flexGapPolyfill.postcss = true;
