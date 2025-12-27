import os
import sys

# Ensure project root is on sys.path when running this file directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from agents import Agent, model_settings, RunConfig
from fi_interaction.tools import tools
from src.core.runner import OptimizedRunner


class Agent:
	"""Weave agent with a single async run(task) -> str API.

	Constructs the underlying SDK Agent and OptimizedRunner once per instance.
	Workflows should instantiate this class and call .run(task) for text output.
	"""

	def __init__(self) -> None:
		config = get_weave_config()
		model_escalation = config.model_escalation
		default_level = model_escalation.default_level
		model = model_escalation.levels[default_level]["model"]

		with open('config/prompts/instructions.md', 'r', encoding='utf-8') as f:
			instructions = f.read()

		self._workflow_name = "Fi Interaction Agent"

		self._agent = Agent(
			name=self._workflow_name,
			instructions=instructions,
			model=model,
			model_settings=model_settings.ModelSettings(
				parallel_tool_calls=True,
			),
			tools=[
				tools.browser_click,
				tools.browser_hover,
				tools.browser_dropdown_select_option,
				tools.browser_calendar_select_option,
				tools.browser_type,
				tools.browser_key_press,
				tools.browser_navigate,
				tools.browser_navigate_forward,
				tools.browser_navigate_back,
				tools.browser_list_tabs,
				tools.browser_new_tab,
				tools.browser_select_tab,
				tools.browser_close_tab,
				tools.browser_print,
				tools.execute_playwright_code,
				tools.browser_extract_data,
			],
		)

		self._runner = OptimizedRunner()

	async def run(self, task: str) -> str:
		"""Run the agent for the provided task and return text output."""
		output = await self._runner.run(
			starting_agent=self._agent,
			input=task,
			run_config=RunConfig(workflow_name=self._workflow_name),
		)

		return output.final_output


# Backwards-compatible module-level entrypoint
async def run(task: str) -> str:
	"""Compatibility wrapper: instantiate the StandardAgent and run the task."""
	agent = Agent()
    
	return await agent.run(task)
