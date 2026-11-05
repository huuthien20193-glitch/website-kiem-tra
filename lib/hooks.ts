'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Trả về false trong lần render đầu (SSR/hydration) và true sau khi đã ở trình duyệt.
 * Dùng để đọc localStorage trong state khởi tạo mà không gây lệch hydration.
 */
export function useIsClient() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
