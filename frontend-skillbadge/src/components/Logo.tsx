interface LogoProps {
  size?: number;
  withWordmark?: boolean;
}

/**
 * Brand mark: an ink shield with a gold check, the signature of a credential
 * registry. Flat and crisp.
 */
export default function Logo({ size = 30, withWordmark = true }: LogoProps) {
  return (
    <span className="logo">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <path
          d="M16 2l12 4v9c0 7.5-5 13.5-12 15C9 28.5 4 22.5 4 15V6z"
          fill="#12151a"
          stroke="#4dabff"
          strokeWidth="2"
        />
        <path
          d="M11 15.5l3.5 3.5L21 12.5"
          stroke="#ffcf4d"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withWordmark && (
        <span className="logo-word">
          Skill<span>Badge</span>
        </span>
      )}
    </span>
  );
}