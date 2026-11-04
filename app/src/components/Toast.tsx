/**
 * Bildirim balonlari (toast).
 *
 * Sorun: islem sonucu bildirimleri sayfanin en ustunde kaliyordu ve oyuncu
 * her islemden sonra yukari kaydirmak zorunda kaliyordu. Cozum: bildirimler
 * ekranin alt-ortasinda, sabit konumda, oyuncuyu rahatsiz etmeyen bir yerde
 * belirir ve kisa sure sonra kendiliginden kaybolur. Boylece sayfada belirli
 * bir yere bakmak gerekmez.
 */

export interface ToastItem {
  id: number;
  kind: "ok" | "error";
  text: string;
}

export interface ToastStackProps {
  items: ToastItem[];
}

export function ToastStack({ items }: ToastStackProps): JSX.Element {
  return (
    <div className="kvt-toasts" role="status" aria-live="polite">
      {items.map((toast) => (
        <div key={toast.id} className={`kvt-toast kvt-toast-${toast.kind}`}>
          {toast.text}
        </div>
      ))}
    </div>
  );
}
