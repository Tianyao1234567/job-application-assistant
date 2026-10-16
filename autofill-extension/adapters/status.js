export function adapterStatus(hostname) {
  if (hostname === 'ubtrobot.zhiye.com') return '优必选北森：真实登录后表单未验证。当前只启用通用引擎，无站点专用选择器。';
  return '当前使用通用引擎；复杂下拉、iframe、封闭 Shadow DOM 需手填。';
}
