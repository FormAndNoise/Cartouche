import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BackendClient } from "../api/client";
import { MockBackendClient } from "../api/mockClient";
import App from "../App";

export function makeClient(latency = 0): MockBackendClient {
 return new MockBackendClient({ latency, jobTickMs: 5 });
}

export function renderApp(client: BackendClient = makeClient()) {
 return render(<App client={client} />);
}

export async function createProjectViaUi(
 name = "Test Deck",
 socketCount = 6,
 path = "/tmp/p",
 client = makeClient(),
) {
 const user = userEvent.setup();
 const res = render(<App client={client} />);

 const nameInput = res.getByTestId("project-name-input");
 await user.clear(nameInput);
 await user.type(nameInput, name);

 const countInput = res.getByTestId("socket-count-input");
 await user.clear(countInput);
 await user.type(countInput, String(socketCount));

 const pathInput = res.getByTestId("project-path-input");
 await user.clear(pathInput);
 await user.type(pathInput, path);

 await user.click(res.getByRole("button", { name: /create project/i }));
 await waitFor(() => expect(res.getByRole("grid")).toBeInTheDocument());
 return { ...res, client, user };
}
