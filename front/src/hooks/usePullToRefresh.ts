import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 72; // 引っ張る距離（px）

export function usePullToRefresh(onRefresh: () => void) {
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const isDragging = useRef(false);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY;
        isDragging.current = true;
      }
    };

    const onTouchMove = (_e: TouchEvent) => {
      // 引っ張り中のデフォルトスクロールはブラウザに任せる
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!isDragging.current) return;
      const dy = e.changedTouches[0].clientY - startY.current;
      if (dy > THRESHOLD && window.scrollY === 0 && !refreshing) {
        setRefreshing(true);
        onRefresh();
        // リフレッシュUIを800ms表示してから解除
        setTimeout(() => setRefreshing(false), 800);
      }
      isDragging.current = false;
      startY.current = 0;
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [onRefresh, refreshing]);

  return { refreshing };
}
