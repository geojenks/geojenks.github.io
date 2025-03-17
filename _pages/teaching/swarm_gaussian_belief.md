---
layout: archive
title: "Gaussian Belief propagation for Swarm Robotics"
permalink: teaching/swarm_gaussian_belief/
author_profile: false
---

This is a page designed for a ~20 minute exercise as part of the Advanced Topics in Robotics course. It is a condensed and adapted version of: [Gaussian Belief Propagation](https://gaussianbp.github.io/). Please refer to that excellent resource for further reading and deeper exploration of the exercises here.

We are going to go through a few exercises to demonstrate how a gaussian belief propagation can be used to estimate functions based on decentralised and uncertain information exchange in a way that is scalable and robust in dynamic environments.

In these interactive demonstrations, we are looking at factor graph information abstractions rather than topological networks or swarms. The “variables” could represent states that a robot may care about (for example its position, the position of a landmark, the position of another robot…) and “factors” represent relationships between these variables, usually by way of a robotic sensor (“this landmark is 2m ahead”, “Robot B is 1m East”, “I have moved 1m forward”...). Each of these are represented as a (multivariate) Gaussian probability density distribution, which means we can perform fast mathematical functions to combine, update, or marginalise these distributions. Each agent in a swarm would only have good knowledge of a subsection of the factor graph, but, as we shall see, propagating gaussian messages through a network means that collectively they can converge toward accurate and complete information.

These demonstrations are taken from [Gaussian Belief Propagation](https://gaussianbp.github.io/), and are not specifically designed for robotic swarms. They should give you an intuition about how GBP works, and may motivate you to explore the maths more thoroughly outside of this session. The resource itself provides a good list of references, I would also encourage you to watch the video summary they provide, and to look at this [distill article](https://distill.pub/2019/visual-exploration-gaussian-processes/#MargCond) for further reading if you are interested.

## Introduction (5 minutes)

<iframe
  id="widgetFrame1"
  src="/assets/teaching/GBP/widget1.html"
  width="100%"
  onload="resizeIframe1(this)"
  ></iframe>
  
<script>
function resizeIframe1(iframe) {
  iframe.style.height = (iframe.contentWindow.document.body.scrollHeight + 100) + 'px';
}
</script>

In each of the interactive widgets below, you can choose to “activate” a node, each time you “activate” one, it performs the actions in the algorithm, in the order above.

## Graph/Network topology (5 minutes)

The important mechanism is that the nodes pass each other simple local information, and converge on a global solution. This has a strong relationship with the way that they are connected. Try the chain, loop, and grid topologies in the box below and see if you can explain why they have slightly different speeds of convergence.

Q. Why do some of them overshoot, taking a while to stabilise?

<iframe
  id="widgetFrame4"
  src="/assets/teaching/GBP/widget4.html"
  width="100%"
  onload="resizeIframe4(this)"
  ></iframe>
  
<script>
function resizeIframe4(iframe) {
  iframe.style.height = (iframe.contentWindow.document.body.scrollHeight + 100) + 'px';
}
</script>

We can set up our graph with a variety of topologies. A chain graph can have a clear order and hierarchy, which means there's very low noise so that it can very quickly converge to the optimal solution.

<iframe
  id="widgetFrame2"
  src="/assets/teaching/GBP/widget2.html"
  width="100%"
  onload="resizeIframe2(this)"
  ></iframe>
  
<script>
function resizeIframe2(iframe) {
  iframe.style.height = (iframe.contentWindow.document.body.scrollHeight + 100) + 'px';
}
</script>

Make a distribution of red data points that approximates a simple or complex function over the space (or generate a random one).

Q. What is the difference between doing a "sweep", a series of random messages, and synchronous iterations? Which is most efficient? Most ordered? Most swarm-like?

Q. Notice that in a "sweep" the nodes only send a message "downstream", then only "upstream". Why would this be difficult in a dynamic swarm?

Q. Clicking on the same node repeatedly does nothing – why?

Make a distribution where there is dense data over 1 area of the graph, and the other areas are empty.

Q. What happens if a variable node has no nearby factors?

Q. Why do the variables line up in a straight line away from datapoints?

## Gaussian Belief Propagation Playground (10 minutes)

<iframe
  id="widgetFrame3"
  src="/assets/teaching/GBP/widget3.html"
  width="100%"
  onload="resizeIframe3(this)"
  ></iframe>
  
<script>
function resizeIframe3(iframe) {
  iframe.style.height = (iframe.contentWindow.document.body.scrollHeight + 100) + 'px';
}
</script>

Set up 2 (or more) connected groups of variable nodes – one chain, one loopy (like example image below). Set the priors to be quite far from the true positions. Then run 1 iteration at a time. You may also try pressing play, and setting the prior position to its maximum, then its minimum.

<img src="/images/3_networks.png" width="45%;"><img src="/images/3_networks_2.png" width="45%;">

Q. What is the difference in the way that the groups converge, why?

Switch over to the "Robot Simulation". This plots a robot's current position, its intermittent historic positions, and the position of landmarks it has "seen".

Q. What happens if the robot travels a long way without seeing a landmark?

Q. What then changes as soon as it sees a landmark? - This is more obvious the more slowly you have the speed running

Q. How does the uncertainty change if you lower or raise the odometry and sensor precision?

Q. What happens to the uncertainty if you add more landmarks, why?

Q. This simulation shows how a single robot can build up a map. How might this translate to a swarm, and what advantages or disadvatages might doing this with a swarm bring?

