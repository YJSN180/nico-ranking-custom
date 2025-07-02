// SVG icons for the application

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export function HamburgerIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M3 12H21M3 6H21M3 18H21"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CloseIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M18 6L6 18M6 6L18 18"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function HomeIcon({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 22V12H15V22"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SettingsIcon({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.9728 17.0628 20.1195 17.2786 20.2223 17.5157C20.3251 17.7528 20.3821 18.0066 20.3902 18.264C20.3983 18.5213 20.3573 18.7782 20.2695 19.0213C20.1817 19.2644 20.049 19.4891 19.8781 19.6831C19.7071 19.8772 19.5014 20.0369 19.2724 20.1535C19.0434 20.2701 18.7954 20.3412 18.5414 20.3634C18.2874 20.3856 18.0322 20.3587 17.7901 20.2841C17.548 20.2096 17.3234 20.089 17.129 19.93L17.069 19.87C16.8332 19.6405 16.5339 19.4858 16.2095 19.427C15.8851 19.3682 15.5505 19.4079 15.249 19.541C14.9531 19.668 14.6999 19.8748 14.5174 20.1377C14.3349 20.4006 14.2305 20.7086 14.216 21.027V21.18C14.216 21.7165 13.9907 22.2312 13.5906 22.6063C13.1905 23.0065 12.6478 23.2318 12.0832 23.2318C11.5186 23.2318 10.9759 23.0065 10.5758 22.6063C10.1757 22.2312 9.95045 21.7165 9.95045 21.18V21.099C9.93534 20.5506 9.71907 20.0267 9.34443 19.6324C8.96979 19.2381 8.46389 19.0021 7.92702 19.97C7.62552 19.8362 7.29102 19.7965 6.96664 19.8553C6.64226 19.9141 6.34294 20.0688 6.10702 20.299L6.04702 20.359C5.85267 20.5418 5.62796 20.6885 5.38409 20.7913C5.14022 20.8941 4.88155 20.9516 4.61958 20.9611C4.35761 20.9706 4.09697 20.9318 3.84958 20.8466C3.60219 20.7614 3.37242 20.6313 3.17148 20.4631C2.97053 20.2949 2.80193 20.0918 2.67398 19.8646C2.54602 19.6373 2.46073 19.3899 2.42204 19.1346C2.38335 18.8793 2.39189 18.6209 2.44728 18.3719C2.50266 18.1229 2.60387 17.8879 2.74502 17.679L2.80502 17.619C3.0352 17.3832 3.18991 17.0839 3.24871 16.7595C3.30751 16.4351 3.26782 16.1005 3.13402 15.799C3.00709 15.5031 2.80026 15.2499 2.53734 15.0674C2.27442 14.8849 1.96644 14.7805 1.64802 14.766H1.49502C0.958607 14.766 0.443926 14.5407 0.0688072 14.1406C-0.306312 13.7405 -0.506516 13.1978 -0.506516 12.6332C-0.506516 12.0686 -0.306312 11.5259 0.0688072 11.1258C0.443926 10.7257 0.958607 10.5005 1.49502 10.5005H1.57602C2.12442 10.4853 2.64825 10.2691 3.04261 9.89444C3.43697 9.5198 3.67291 9.01389 3.70502 8.47703C3.83882 8.17552 3.87851 7.84102 3.81971 7.51664C3.76091 7.19226 3.60619 6.89294 3.37602 6.65703L3.31602 6.59703C3.13323 6.40267 2.98654 6.17796 2.88363 5.93409C2.78071 5.69022 2.72317 5.43156 2.71365 5.16958C2.70413 4.90761 2.74288 4.64697 2.82806 4.39958C2.91323 4.15219 3.04334 3.92242 3.21152 3.72148C3.37971 3.52053 3.58285 3.35193 3.81013 3.22398C4.03741 3.09602 4.28476 3.01073 4.54007 2.97204C4.79538 2.93335 5.05372 2.94189 5.30276 2.99728C5.5518 3.05266 5.78684 3.15387 5.99602 3.29503L6.05602 3.35503C6.29194 3.5852 6.59126 3.73991 6.91564 3.79871C7.24002 3.85751 7.57453 3.81782 7.87602 3.68403H7.92702C8.22289 3.55709 8.47607 3.35026 8.65858 3.08734C8.84109 2.82442 8.94554 2.51644 8.96002 2.19803V2.04503C8.96002 1.50859 9.18525 0.993913 9.58537 0.618794C9.98549 0.218675 10.5282 -0.00652695 11.0928 -0.00652695C11.6574 -0.00652695 12.2001 0.218675 12.6002 0.618794C13.0003 0.993913 13.2256 1.50859 13.2256 2.04503V2.12603C13.24 2.44444 13.3445 2.75242 13.527 3.01534C13.7095 3.27826 13.9627 3.48509 14.2586 3.61203C14.5601 3.74582 14.8946 3.78551 15.219 3.72671C15.5433 3.66791 15.8427 3.5132 16.0786 3.28303L16.1386 3.22303C16.3329 3.04024 16.558 2.89355 16.8018 2.79064C17.0457 2.68772 17.3044 2.63018 17.5664 2.62066C17.8283 2.61114 18.089 2.64989 18.3364 2.73507C18.5838 2.82024 18.8135 2.95035 19.0145 3.11853C19.2154 3.28672 19.384 3.48986 19.512 3.71714C19.6399 3.94442 19.7252 4.19177 19.7639 4.44708C19.8026 4.70239 19.7941 4.96073 19.7387 5.20977C19.6833 5.4588 19.5821 5.69385 19.441 5.90303L19.381 5.96303C19.1508 6.19894 18.9961 6.49826 18.9373 6.82264C18.8785 7.14702 18.9182 7.48153 19.052 7.78303V7.83403C19.1789 8.1299 19.3857 8.38308 19.6486 8.56559C19.9116 8.7481 20.2195 8.85255 20.538 8.86703H20.691C21.2274 8.86703 21.7421 9.09226 22.1172 9.49238C22.5173 9.8925 22.7426 10.4352 22.7426 10.9998C22.7426 11.5644 22.5173 12.1071 22.1172 12.5072C21.7421 12.9073 21.2274 13.1326 20.691 13.1326H20.61C20.2916 13.147 19.9836 13.2515 19.7207 13.434C19.4578 13.6165 19.2509 13.8697 19.124 14.1656Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function InfoIcon({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="16"
        x2="12"
        y2="12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="8"
        x2="12.01"
        y2="8"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function MailIcon({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 6L12 13L2 6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BookIcon({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M4 19.5C4 18.837 4.26339 18.2011 4.73223 17.7322C5.20107 17.2634 5.83696 17 6.5 17H20"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 2H20V22H6.5C5.83696 22 5.20107 21.7366 4.73223 21.2678C4.26339 20.7989 4 20.163 4 19.5V4.5C4 3.83696 4.26339 3.20107 4.73223 2.73223C5.20107 2.26339 5.83696 2 6.5 2Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ExternalLinkIcon({ size = 16, color = 'currentColor', className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M18 13V19C18 19.5304 17.7893 20.0391 17.4142 20.4142C17.0391 20.7893 16.5304 21 16 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 20.5304 3 20V9C3 8.46957 3.21071 7.96086 3.58579 7.58579C3.96086 7.21071 4.46957 7 5 7H11"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 3H21V9"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 14L21 3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ShieldIcon({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function HistoryIcon({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M3 12C3 13.1819 3.23279 14.3522 3.68508 15.4442C4.13738 16.5361 4.80031 17.5282 5.63604 18.364C6.47177 19.1997 7.46392 19.8626 8.55585 20.3149C9.64778 20.7672 10.8181 21 12 21C13.1819 21 14.3522 20.7672 15.4442 20.3149C16.5361 19.8626 17.5282 19.1997 18.364 18.364C19.1997 17.5282 19.8626 16.5361 20.3149 15.4442C20.7672 14.3522 21 13.1819 21 12C21 10.8181 20.7672 9.64778 20.3149 8.55585C19.8626 7.46392 19.1997 6.47177 18.364 5.63604C17.5282 4.80031 16.5361 4.13738 15.4442 3.68508C14.3522 3.23279 13.1819 3 12 3C10.8181 3 9.64778 3.23279 8.55585 3.68508C7.46392 4.13738 6.47177 4.80031 5.63604 5.63604"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 3V9H9"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 7V12L15 15"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ThemeIcon({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M21 12.79C20.8427 14.4922 20.2039 16.1144 19.1583 17.4668C18.1127 18.8192 16.7035 19.8458 15.0957 20.4265C13.4879 21.0073 11.748 21.1181 10.0795 20.7461C8.41104 20.3741 6.88302 19.5345 5.67425 18.3258C4.46548 17.117 3.62596 15.589 3.25393 13.9205C2.8819 12.252 2.99274 10.5121 3.57348 8.9043C4.15423 7.29651 5.18085 5.88737 6.53324 4.84175C7.88562 3.79614 9.50782 3.15731 11.21 3C10.2134 4.34827 9.73387 6.00945 9.85856 7.68141C9.98324 9.35338 10.7039 10.9251 11.8894 12.1106C13.075 13.2961 14.6466 14.0168 16.3186 14.1415C17.9906 14.2662 19.6518 13.7866 21 12.79Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function VideoIcon({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <polygon
        points="23 7 16 12 23 17 23 7"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="1"
        y="5"
        width="15"
        height="14"
        rx="2"
        ry="2"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function GuideIcon({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.09 9C9.3251 8.33167 9.78915 7.76811 10.4 7.40913C11.0108 7.05016 11.7289 6.91894 12.4272 7.03871C13.1255 7.15849 13.7588 7.52152 14.2151 8.06353C14.6713 8.60553 14.9211 9.29152 14.92 10C14.92 12 11.92 13 11.92 13"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="17"
        x2="12.01"
        y2="17"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function MylistIcon({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M13 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V9L13 2Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 2V9H20"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 13H15"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 17H15"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
