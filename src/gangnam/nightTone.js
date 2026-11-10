// [gangnam-night] 21시의 전역 하늘은 이미 밤이다(11월 서울 태양고도 약 −42°, dayK=0).
//   밝아 보이던 바닥은 강남 전용 인도 빛이다. 환경광만 강남 박스·밤(21–04시)에서 더 낮춘다.
//   정자·미금·잠실은 이 값이 1이라 그대로다.

export function gangnamAmbientScale(hour, inside) {
  if (!inside) return 1;
  const h = ((hour % 24) + 24) % 24;
  if (h >= 21 || h < 4) return 0.44;
  return 1;
}
