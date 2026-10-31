/** The table stays mounted under the intercepted order panel. */
export default function OrdersLayout({ children, panel }: LayoutProps<"/orders">) {
  return (
    <>
      {children}
      {panel}
    </>
  );
}
