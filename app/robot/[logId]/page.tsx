import { notFound } from "next/navigation";
import { flagOn } from "@/lib/app-config";
import RunDetail from "@/components/robot/RunDetail";

/** One uploaded run of the robot (#120): charts, findings and editable labels. */
export default async function RobotRunPage({ params }: { params: Promise<{ logId: string }> }) {
    if (!(await flagOn("robotHealth"))) notFound();
    const { logId } = await params;
    // Firestore auto-ids only; anything else ("a/b") would throw in the client SDK.
    if (!/^[A-Za-z0-9]{20}$/.test(logId)) notFound();
    return (
        <div className="container mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
            <RunDetail logId={logId} />
        </div>
    );
}
