---
layout: archive
title: "Gaussian Belief propagation for Swarm Robotics"
permalink: teaching/swarm_gaussian_belief/
author_profile: false
---

This is a page designed for a ~20 minute exercise as part of the Advanced Topics in Robotics course. It is a condensed and adapted version of: [Gaussian Belief Propagation](https://gaussianbp.github.io/). Please refer to that excellent resource for further reading and deeper exploration of the exercises here.

We are going to go through a few exercises to demonstrate how a gaussian belief propagation can be used to estimate functions based on decentralised and uncertain information exchange in a way that is scalable and robust in dynamic environments.

In these interactive demonstrations, we are looking at factor graph information abstractions rather than topological networks or swarms. The “variables” could represent states that a robot may care about (for example its position, the position of a landmark, the position of another robot…) and “factors” represent relationships between these variables, usually by way of a robotic sensor (“this landmark is 2m ahead”, “Robot B is 1m East”, “I have moved 1m forward”...). Each of these are represented as a (multivariate) Gaussian probability density distribution, which means we can perform fast functions to combine, update, or marginalise. Each agent in a swarm would only have good knowledge of a subsection of the factor graph, but, as we shall see, collectively they can converge toward accurate and complete information.

These demonstrations are taken from [Gaussian Belief Propagation](https://gaussianbp.github.io/), and are not specifically designed for robotic swarms. They should give you an intuition about how GBP works, and may motivate you to explore the maths more thoroughly outside of this session. The resource itself provides a good list of references, I would also encourage you to watch the video summary they provide, and to look at this [distill article](https://distill.pub/2019/visual-exploration-gaussian-processes/#MargCond) for further reading if you are interested.

1.	This is the belief propagation algorithm. In each of the interactive widgets below, you can choose to “activate” a node, each time you “activate” one, it performs these actions, in this order:

<iframe
  id="widgetFrame"
  src="/assets/teaching/GBP/widget1.html"
  width="100%"
  onload="resizeIframe(this)"
  ></iframe>


<iframe
  id="widgetFrame"
  src="/assets/teaching/GBP/widget4.html"
  width="100%"
  onload="resizeIframe(this)"
  ></iframe>

We can set up our graph with a variety of topologies. A chain graph can have a clear order and hierarchy, which means there's very low noise so that it can very quickly converge to the optimal solution.

<iframe
  id="widgetFrame"
  src="/assets/teaching/GBP/widget2.html"
  width="100%"
  onload="resizeIframe(this)"
  ></iframe>

Make a distribution of red data points that approximates a simple or complex function over the space (or generate a random one).

Q. What is the difference between doing a "sweep", a series of random messages, and synchronous iterations? Which is most efficient? Most ordered? Most swarm-like?

Q. Clicking on the same node repeatedly does nothing – why?

Make a distribution where there is dense data over 1 area of the graph, and the other areas are empty.

Q. What happens if a variable node has no nearby factors?

Q. Why do they line up in a straight line away from datapoints?

<iframe
  id="widgetFrame"
  src="/assets/teaching/GBP/widget3.html"
  width="100%"
  onload="resizeIframe(this)"
  ></iframe>

Set up 2 connected groupd of – one chain, one loopy. What is the difference in their speed to convergence, why?

<script>
function resizeIframe(iframe) {
  iframe.style.height = (iframe.contentWindow.document.body.scrollHeight + 100) + 'px';
}
</script>
