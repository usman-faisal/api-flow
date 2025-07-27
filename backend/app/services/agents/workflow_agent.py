from enum import Enum
from typing import Any, AsyncGenerator, Dict, List, TypedDict, cast, Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from app.models.workflow import (
    ActionType,
    ApiDetails,
    Plan,
    WorkflowRequest,
    WorkflowResponse,
    WorkflowStepResponse,
)
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import END, START, StateGraph
from app.core.config import settings
from app.services.agents.system_prompts import (
    API_CALL_SYSTEM_PROMPT,
    EXTRACT_DATA_SYSTEM_PROMPT,
    WORKFLOW_PLAN_SYSTEM_PROMPT,
)
import requests
import logging
import json


logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)


class AgentState(TypedDict):
    # this would be the user prompt that initiated the agent's workflow
    user_prompt: str

    plan: Plan

    step_index: int

    # this would be the data extracted from each api call
    extracted_data: Dict[str, Any]

    # this would be the history of requests made by the agent
    request_history: List[Dict[str, Any]]

    current_response: Optional[Dict[str, Any]]
    # A flag to indicate a workflow-halting error has occurred
    error: Optional[str]


llm = ChatGoogleGenerativeAI(
    model="gemini-1.5-flash-8b",
    temperature=0.1,
    api_key=settings.GEMINI_API_KEY,
)


def create_plan_node(state: AgentState) -> AgentState:
    """
    This function creates a plan node based on the user prompt of the agent.
    """

    logging.info("PLAN NODE")
    prompt_template = ChatPromptTemplate(
        [
            ("system", WORKFLOW_PLAN_SYSTEM_PROMPT),
            ("human", "User's request: {prompt}"),
        ]
    )

    llm_structured = llm.with_structured_output(Plan)

    chain = prompt_template | llm_structured

    input_for_chain = {"prompt": state["user_prompt"]}

    structured_plan_output = chain.invoke(input_for_chain)

    logging.info("PLAN OUTPUT: %s", structured_plan_output)

    state["plan"] = cast(Plan, structured_plan_output)

    logging.info("UPDATED STATE: %s", state)

    return state


def _format_recursively(data: Any, format_with: Dict[str, Any]) -> Any:
    """Recursively formats strings with placeholders in a nested structure."""
    if isinstance(data, str):
        try:
            return data.format(**format_with)
        except KeyError:
            return data
    if isinstance(data, dict):
        return {k: _format_recursively(v, format_with) for k, v in data.items()}
    if isinstance(data, list):
        return [_format_recursively(i, format_with) for i in data]
    return data


def make_api_call_node(state: AgentState) -> AgentState:
    """
    Constructs and executes an API call based on the current plan step,
    handling dynamic data and errors robustly.
    """
    current_task = state["plan"].steps[state["step_index"]]
    logging.info(f"Executing step {state['step_index']}: {current_task.description}")

    prompt_template = ChatPromptTemplate(
        [
            ("system", API_CALL_SYSTEM_PROMPT),
            (
                "human",
                """
            CONTEXT FOR THIS TASK:
            - Original User Prompt: {user_prompt}
            - Current Step Description: {step_description}
            - Previously Extracted Data: {extracted_data}
            """,
            ),
        ]
    )
    llm_structured = llm.with_structured_output(ApiDetails)
    chain = prompt_template | llm_structured

    input_for_chain = {
        "user_prompt": state["user_prompt"],
        "step_description": current_task.description,
        "extracted_data": state["extracted_data"],
    }

    try:
        api_details_template: ApiDetails = cast(
            ApiDetails, chain.invoke(input_for_chain)
        )
    except Exception as e:
        logging.error(f"LLM failed to generate valid ApiDetails: {e}")
        state["error"] = "LLM failed to structure the API call details."
        return state

    api_details = _format_recursively(
        api_details_template.model_dump(), state["extracted_data"]
    )
    logging.info(f"Formatted API Details: {api_details}")

    response_data = None
    try:
        response = requests.request(
            method=api_details["method"],
            url=api_details["url"],
            json=api_details.get("body"),
            headers=api_details.get("headers"),
            timeout=10,  # Add a timeout for robustness
        )
        response.raise_for_status()

        try:
            response_data = response.json()
            logging.info(f"API Response Data: {response_data}")
        except ValueError:
            logging.warning("API response was not valid JSON. Storing raw text.")
            response_data = {"raw_content": response.text}

    except requests.exceptions.HTTPError as e:
        logging.error(f"HTTP Error: {e.response.status_code} {e.response.reason}")
        state["error"] = (
            f"API call failed with status {e.response.status_code}: {e.response.reason}"
        )
        response_data = {"error": state["error"], "content": e.response.text}
    except requests.exceptions.RequestException as e:
        logging.error(f"Request Exception: {e}")
        state["error"] = f"API call failed due to a network error: {e}"
        response_data = {"error": state["error"]}

    state["current_response"] = response_data
    state["request_history"].append(
        {
            "step_index": state["step_index"],
            "api_details": api_details,
            "response_data": response_data,
            "error": state["error"],
        }
    )

    return state


def extract_data_node(state: AgentState) -> AgentState:
    """
    Looks at the most recent API response and extracts data needed
    for the next step in the plan.
    """
    logging.info("EXTRACT DATA NODE")

    if state["current_response"] is None or state["error"]:
        logging.warning(
            "Skipping data extraction due to missing response or prior error."
        )
        return state

    if state["step_index"] >= len(state["plan"].steps) - 1:
        logging.info("Last step reached. No further data extraction needed.")
        return state

    next_step_description = state["plan"].steps[state["step_index"] + 1].description
    api_response = state["current_response"]

    prompt_template = ChatPromptTemplate.from_messages(
        [
            ("system", EXTRACT_DATA_SYSTEM_PROMPT),
            (
                "human",
                """
                CONTEXT FOR THIS TASK:
                - API Response to parse: {api_response}
                - Description of the next step that needs this data: {next_step_description}
                """,
            ),
        ]
    )

    chain = prompt_template | llm

    try:
        ai_message = chain.invoke(
            {
                "api_response": api_response,
                "next_step_description": next_step_description,
            }
        )
        logging.info(f"Raw LLM Output: {ai_message}")

        llm_output_str = ""

        if isinstance(ai_message.content, str):
            llm_output_str = ai_message.content
        else:
            raise TypeError(
                "LLM output is not a string or does not have 'content' attribute."
            )


        if "```json" in llm_output_str:
            cleaned_str = llm_output_str.split("```json\n")[1].split("\n```")[0]
        else:
            cleaned_str = llm_output_str

        newly_extracted_data = {}
        if cleaned_str:
            parsed_data = json.loads(cleaned_str)
            newly_extracted_data = parsed_data.get("data", {})

        logging.info(
            "Parsed LLM output as JSON: %s", newly_extracted_data
        )

        state["extracted_data"].update(newly_extracted_data)

    except (json.JSONDecodeError, IndexError, AttributeError) as e:
        logging.error(f"LLM failed during data extraction or parsing: {e}")
    except Exception as e:
        logging.error(f"An unexpected error occurred during data extraction: {e}")

    return state


def increment_step_index(state: AgentState) -> AgentState:
    """
    This function increments the step index in the agent's state.
    """
    state["step_index"] += 1
    return state


def should_proceed(state: AgentState) -> bool:
    """
    This function checks if there are more steps in the plan to execute.
    """
    return state["step_index"] < len(state["plan"].steps)

from langgraph.graph import END

def route_action(state: AgentState) -> str:
    """
    Checks if the workflow should continue and, if so,
    routes to the correct node based on the current step's action_type.
    """
    if not should_proceed(state):
        return END

    current_step = state["plan"].steps[state["step_index"]]
    
    return current_step.action_type.value


workflow_graph = StateGraph(AgentState)

workflow_graph.add_node("create_plan", create_plan_node)
workflow_graph.add_node("make_api_call", make_api_call_node)
workflow_graph.add_node("extract_data", extract_data_node)
workflow_graph.add_node("increment_step", increment_step_index)

workflow_graph.add_edge(START, "create_plan")

workflow_graph.add_conditional_edges(
    "create_plan",
    route_action,
    {
        "api_call": "make_api_call",
        "data_extraction": "extract_data",
        END: END, 
    },
)

workflow_graph.add_edge("make_api_call", "increment_step")
workflow_graph.add_edge("extract_data", "increment_step")

workflow_graph.add_conditional_edges(
    "increment_step",
    route_action,
    {
        "api_call": "make_api_call",
        "data_extraction": "extract_data",
        END: END,
    },
)

graph = workflow_graph.compile()


# This is a new data model for our stream events
class StreamEvent(TypedDict):
    event: str
    data: Dict[str, Any]

async def stream_workflow_graph(
    request: WorkflowRequest,
) -> AsyncGenerator[str, None]:
    """
    Initializes and runs the workflow graph, yielding real-time events
    formatted as Server-Sent Events (SSE).
    """
    initial_state: AgentState = {
        "user_prompt": request.prompt,
        "plan": Plan(steps=[]),
        "step_index": 0,
        "extracted_data": {},
        "request_history": [],
        "current_response": None,
        "error": None,
    }

    def create_sse_event(event_name: str, data: Dict[str, Any]) -> str:
        """Formats a dictionary into an SSE message string."""
        json_data = json.dumps({"event": event_name, "data": data})
        return f"data: {json_data}\n\n"

    try:
        async for state_update in graph.astream(initial_state):
            node_name = list(state_update.keys())[0]
            current_state = state_update[node_name]

            if node_name == "create_plan":
                yield create_sse_event(
                    "plan_created", current_state["plan"].model_dump()
                )

            elif node_name == "make_api_call":
                last_request = current_state["request_history"][-1]
                current_step_index = last_request["step_index"]
                step_description = current_state["plan"].steps[
                    current_step_index
                ].description

                step_response = WorkflowStepResponse(
                    step_title=f"Step {current_step_index + 1}: {step_description}",
                    request_details=last_request.get("api_details", {}),
                    response_details=last_request.get("response_data", {}),
                    extracted_data=None,
                )
                yield create_sse_event("api_call_completed", step_response.model_dump())

            elif node_name == "extract_data":
                prev_step_index = current_state["step_index"] - 1
                step_description = current_state["plan"].steps[prev_step_index].description

                extraction_details = {
                    "step_title": f"Data Extraction after: {step_description}",
                    "extracted_data": current_state["extracted_data"]
                }
                yield create_sse_event("data_extracted", extraction_details)

            if error := current_state.get("error"):
                yield create_sse_event("error", {"detail": error})
                break # Stop the stream on error

    except Exception as e:
        logging.error(f"Error during graph stream: {e}", exc_info=True)
        yield create_sse_event("error", {"detail": f"An unexpected error occurred: {str(e)}"})

    yield create_sse_event("end", {"message": "Workflow finished."})
