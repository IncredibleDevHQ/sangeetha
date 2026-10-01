CREATE TABLE fee_plans (
 school_id UUID NOT NULL, id UUID NOT NULL, enrollment_id UUID NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), concession INTEGER NOT NULL DEFAULT 0 CHECK(concession>=0 AND concession<amount), due_day INTEGER NOT NULL CHECK(due_day BETWEEN 1 AND 28), active BOOLEAN NOT NULL DEFAULT true, PRIMARY KEY(school_id,id), FOREIGN KEY(school_id,enrollment_id) REFERENCES enrollments(school_id,id), UNIQUE(school_id,enrollment_id)
);
CREATE TABLE charges (
 school_id UUID NOT NULL, id UUID NOT NULL, household_id UUID NOT NULL, learner_id UUID, enrollment_id UUID, event_id UUID, category TEXT NOT NULL CHECK(category IN ('tuition','event')), description TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), due_on DATE NOT NULL, period TEXT, key TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,id), UNIQUE(school_id,key), FOREIGN KEY(school_id,household_id) REFERENCES households(school_id,id), FOREIGN KEY(school_id,learner_id) REFERENCES learners(school_id,id), FOREIGN KEY(school_id,enrollment_id) REFERENCES enrollments(school_id,id)
);
CREATE TABLE payments (
 school_id UUID NOT NULL, id UUID NOT NULL, household_id UUID NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), method TEXT NOT NULL CHECK(method IN ('cash','bank','upi','gateway')), reference TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'claim' CHECK(status IN ('claim','verified','reversed')), key TEXT NOT NULL, receipt TEXT, verified_by UUID REFERENCES accounts(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,id), UNIQUE(school_id,key), UNIQUE(school_id,receipt), FOREIGN KEY(school_id,household_id) REFERENCES households(school_id,id)
);
CREATE TABLE allocations (
 school_id UUID NOT NULL, id UUID NOT NULL, payment_id UUID NOT NULL, charge_id UUID NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), reversed_at TIMESTAMPTZ, reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,id), FOREIGN KEY(school_id,payment_id) REFERENCES payments(school_id,id), FOREIGN KEY(school_id,charge_id) REFERENCES charges(school_id,id)
);
CREATE TABLE financial_entries (
 school_id UUID NOT NULL, id UUID NOT NULL, household_id UUID NOT NULL, payment_id UUID, charge_id UUID, kind TEXT NOT NULL CHECK(kind IN ('adjustment','refund')), amount INTEGER NOT NULL CHECK(amount<>0), reason TEXT NOT NULL, key TEXT NOT NULL, actor_id UUID NOT NULL REFERENCES accounts(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,id), UNIQUE(school_id,key), FOREIGN KEY(school_id,household_id) REFERENCES households(school_id,id), FOREIGN KEY(school_id,payment_id) REFERENCES payments(school_id,id), FOREIGN KEY(school_id,charge_id) REFERENCES charges(school_id,id), CHECK((kind='refund' AND amount>0 AND payment_id IS NOT NULL AND charge_id IS NULL) OR (kind='adjustment' AND charge_id IS NOT NULL AND payment_id IS NULL))
);
CREATE INDEX charge_household ON charges(school_id,household_id,due_on);
