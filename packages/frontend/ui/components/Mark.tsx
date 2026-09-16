import { useState } from "react";
import { Bolt } from "../icons";

/** FlashLearn mark: the supplied icon at /flashlearn-icon.png, with a bolt fallback
 *  if the file isn't present yet. */
export function Mark({ size = 18, radius = "50%" }: { size?: number; radius?: number | string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <Bolt size={size * 0.62} />;
  return (
    <img
       src={`${import.meta.env.BASE_URL}flashlearn-icon.png`}
      width={size}
      height={size}
      alt=""
      onError={() => setOk(false)}
      style={{ display: "block", width: size, height: size, borderRadius: radius, objectFit: "cover" }}
    />
  );
}
