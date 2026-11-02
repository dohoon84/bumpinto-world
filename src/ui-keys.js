// 키보드로 포커스한 HUD 버튼에서 Enter/Space 가 게임 단축키(Enter=채팅 열기, Space=점프 + preventDefault)로
// 새지 않게 막는다. 기본 동작(버튼 click)은 그대로 둔다. 마우스 클릭으로는 포커스 자체를 주지 않는다
export function hudButton(btn) {
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') e.stopPropagation(); });
  return btn;
}
