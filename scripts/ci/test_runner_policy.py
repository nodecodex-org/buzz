import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("runner_policy", Path(__file__).with_name("check-runner-policy.py"))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)

class RunnerPolicyTests(unittest.TestCase):
    def test_literal_and_array_hosted(self):
        for value in ["ubuntu-slim", "ubuntu-latest", "ubuntu-24.04-arm", "macos-14", "windows-latest", ["self-hosted", "ubuntu-latest"]]:
            with self.subTest(value=value):
                self.assertIsNotNone(policy.check_labels(value, {}))

    def test_self_hosted_resource_classes(self):
        for labels in [["self-hosted", "Linux", "nodecodex-ci"], ["self-hosted", "nodecodex-memory-heavy"], ["self-hosted", "Windows", "nodecodex-ci-windows"]]:
            self.assertIsNone(policy.check_labels(labels, {}))

    def test_matrix_and_hosted_fallback(self):
        self.assertIsNone(policy.check_labels("${{ matrix.runner }}", {"include": [{"runner": ["self-hosted", "Linux"]}]}))
        self.assertIsNotNone(policy.check_labels("${{ matrix.runner }}", {"include": [{"runner": ["self-hosted"]}, {"runner": "ubuntu-latest"}]}))
        self.assertIsNotNone(policy.check_labels("${{ fromJSON(condition && '[\"self-hosted\"]' || '[\"ubuntu-latest\"]') }}", {}))

    def test_conditionals_require_two_audited_results(self):
        self.assertIsNone(policy.check_labels("${{ (inputs.target == 'x' || startsWith(inputs.name, 'repair-')) && fromJSON('[\"self-hosted\",\"nodecodex-ci-control\"]') || fromJSON('[\"self-hosted\",\"nodecodex-ci\"]') }}", {}))
        for selector in [
            "${{ condition && fromJSON('[\"self-hosted\"]') || vars.RUNNER }}",
            "${{ (a) || vars.RUNNER || (b) && fromJSON('[\"self-hosted\"]') || fromJSON('[\"self-hosted\"]') }}",
        ]:
            self.assertIsNotNone(policy.check_labels(selector, {}))

    def test_unknown_dynamic_and_missing_matrix_fail_closed(self):
        for value in ["${{ vars.RUNNER }}", "${{ matrix.runner }}", None]:
            self.assertIsNotNone(policy.check_labels(value, {}))

    def test_reusable_callers_and_comments(self):
        self.assertEqual(policy.check_workflow("jobs:\n  ci:\n    uses: org/repo/.github/workflows/ci.yml@main\n"), [])
        self.assertEqual(policy.check_workflow("# ubuntu-latest is retired\njobs:\n  ci:\n    runs-on: [self-hosted, nodecodex-ci]\n"), [])

if __name__ == "__main__":
    unittest.main()
