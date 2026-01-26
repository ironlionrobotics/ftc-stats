import MatchScoutingForm from "@/components/scouting/MatchScoutingForm";

export default function NewScoutingReportPage() {
    return (
        <div className="container mx-auto px-4 py-6">
            <h1 className="text-2xl font-bold mb-6 text-center">New Match Report</h1>
            <MatchScoutingForm />
        </div>
    );
}
