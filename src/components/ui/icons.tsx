import type { ComponentType, SVGProps } from "react";

/**
 * The icon set: a 16 px grid, 1.5 px strokes, and `currentColor`, so icons
 * follow the text colour in both themes. Decorative by default; the control
 * around an icon carries the accessible name.
 */
type IconProps = SVGProps<SVGSVGElement>;

function base(paths: React.ReactNode) {
  return function Icon(props: IconProps) {
    return (
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const OverviewIcon = base(<path d="M2.5 13.5h11M4.5 13.5V8.5M8 13.5v-10M11.5 13.5V6" />);
export const OrdersIcon = base(
  <>
    <path d="M3.5 2.5h9v11l-2.25-1.25L8 13.5l-2.25-1.25L3.5 13.5z" />
    <path d="M6 6h4M6 8.75h4" />
  </>,
);
export const InventoryIcon = base(
  <>
    <path d="M2.5 5 8 2.5 13.5 5v6L8 13.5 2.5 11z" />
    <path d="M2.5 5 8 7.5 13.5 5M8 7.5v6" />
  </>,
);
export const CustomersIcon = base(
  <>
    <circle cx="8" cy="5.25" r="2.75" />
    <path d="M2.75 13.5c.5-2.75 2.6-4 5.25-4s4.75 1.25 5.25 4" />
  </>,
);
export const SettingsIcon = base(
  <path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6M10 3v3M6 10v3" />,
);
export const SearchIcon = base(
  <>
    <circle cx="7" cy="7" r="4.25" />
    <path d="m10.25 10.25 3.25 3.25" />
  </>,
);
export const MenuIcon = base(<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />);
export const CloseIcon = base(<path d="m3.5 3.5 9 9M12.5 3.5l-9 9" />);
export const RailIcon = base(
  <>
    <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
    <path d="M6.5 3v10" />
  </>,
);
export const SunIcon = base(
  <>
    <circle cx="8" cy="8" r="2.75" />
    <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1" />
  </>,
);
export const MoonIcon = base(<path d="M13 9.75A5.5 5.5 0 0 1 6.25 3 5.5 5.5 0 1 0 13 9.75z" />);
export const SystemIcon = base(
  <>
    <rect x="2" y="3" width="12" height="8" rx="1.25" />
    <path d="M6 13.5h4" />
  </>,
);
export const CheckIcon = base(<path d="m3.5 8.5 3 3 6-7" />);
export const ChevronIcon = base(<path d="m4.5 6.5 3.5 3.5 3.5-3.5" />);

export const NAV_ICONS = {
  overview: OverviewIcon,
  orders: OrdersIcon,
  inventory: InventoryIcon,
  customers: CustomersIcon,
  settings: SettingsIcon,
} satisfies Record<string, ComponentType<IconProps>>;
