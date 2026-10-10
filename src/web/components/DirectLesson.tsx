import { useEffect, useState } from "react";
import { LibraryView } from "../features/school/Learning";
import { PageHeader } from "./PageHeader";
import {
  useSchool,
  Alerts,
  type School,
  type Row,
} from "../features/school/common";
export function DirectLesson({
  school,
  manage,
}: {
  school: School;
  manage: boolean;
}) {
  const tools = useSchool(school);
  const [portal, setPortal] = useState<{
    learners: Row[];
    teachingBatches: Row[];
  }>({ learners: [], teachingBatches: [] });
  useEffect(() => {
    tools
      .read<typeof portal>("portal")
      .then(setPortal)
      .catch((e) => tools.setError(e.message));
  }, [tools.read]);
  return (
    <PageHeader
      title="Lessons"
      description="Listen, watch and practise, one lesson at a time."
    >
      <Alerts tools={tools} />
      <fieldset className="workbench" disabled={tools.busy}>
        <LibraryView
          tools={tools}
          manage={manage}
          batches={portal.teachingBatches}
          portalLearners={portal.learners}
        />
      </fieldset>
    </PageHeader>
  );
}
