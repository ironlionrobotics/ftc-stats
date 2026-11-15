import { permanentRedirect } from "next/navigation";

/** English-friendly alias of the explainer page. */
export default function AboutAlias() {
    permanentRedirect("/acerca");
}
