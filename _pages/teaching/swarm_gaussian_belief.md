---
layout: archive
title: "Gaussian Belief propagation for Swarm Robotics"
permalink: teaching/swarm_gaussian_belief/
author_profile: false
---

This is a page designed for a ~20 minute exercise as part of the Advanced Topics in Robotics course. It is a condensed and adapted version of: [Gaussian Belief Propagation](https://gaussianbp.github.io/). Please refer to that excellent resource for further reading and deeper exploration of the exercises here.

We are going to go through a few exercises to demonstrate how a gaussian belief propagation can be used to estimate functions based on decentralised and uncertain information exchange in a way that is scalable and robust in dynamic environments.

In these interactive demonstrations, we are looking at factor graph information abstractions rather than topological networks or swarms. The “variables” could represent states that a robot may care about (for example its position, the position of a landmark, the position of another robot…) and “factors” represent relationships between these variables, usually by way of a robotic sensor (“this landmark is 2m ahead”, “Robot B is 1m East”, “I have moved 1m forward”...). Each agent in a swarm would only have knowledge of a subsection of the factor graph, but, as we shall see, collectively they can converge toward accurate and complete information.

These demonstrations are taken from [Gaussian Belief Propagation](https://gaussianbp.github.io/), and are not specifically designed for robotic swarms. They should give you an intuition about how GBP works, and may motivate you to explore the maths more thoroughly outside of this session. The resource itself provides a good list of references, I would also encourage you to watch the video summary they provide, and to look at this [distill article](https://distill.pub/2019/visual-exploration-gaussian-processes/#MargCond) for further reading if you are interested.


<iframe
  id="widgetFrame"
  src="/assets/teaching/GBP/widget1.html"
  width="100%"
  onload="resizeIframe(this)"
  ></iframe>

<script>
function resizeIframe(iframe) {
  iframe.style.height = (iframe.contentWindow.document.body.scrollHeight + 100) + 'px';
}
</script>
